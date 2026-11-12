BEGIN;

CREATE TABLE IF NOT EXISTS website_config_drafts (
  business_id integer PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  published_revision integer NOT NULL DEFAULT 0 CHECK (published_revision >= 0),
  updated_at timestamp NOT NULL DEFAULT now()
);

LOCK TABLE website_configs IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO website_config_drafts (business_id, sections, settings, revision, published_revision, updated_at)
SELECT business_id, sections, settings, 1, CASE WHEN published THEN 1 ELSE 0 END, updated_at
FROM website_configs
ON CONFLICT (business_id) DO NOTHING;

CREATE OR REPLACE FUNCTION website_config_drafts_serialize_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(734210, 1);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION website_configs_publish_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(734210, 1);
  IF current_setting('app.website_publish_allowed', true) IS DISTINCT FROM 'on' THEN
    IF TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND (
         NEW.sections IS DISTINCT FROM OLD.sections
         OR NEW.settings IS DISTINCT FROM OLD.settings
         OR NEW.published IS DISTINCT FROM OLD.published
         OR NEW.published_at IS DISTINCT FROM OLD.published_at
       )) THEN
      RAISE EXCEPTION 'Published website content may only change through explicit Publish'
        USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION website_media_reference_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  paths_changed boolean := false;
  referenced boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(734210, 1);
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;

  paths_changed := TG_OP = 'DELETE'
    OR NEW.url IS DISTINCT FROM OLD.url
    OR NEW.object_path IS DISTINCT FROM OLD.object_path
    OR NEW.webp_object_path IS DISTINCT FROM OLD.webp_object_path
    OR NEW.thumbnail_object_path IS DISTINCT FROM OLD.thumbnail_object_path
    OR NEW.display_object_path IS DISTINCT FROM OLD.display_object_path;

  IF paths_changed THEN
    SELECT EXISTS (
      SELECT 1 FROM website_configs c
      WHERE position(OLD.url IN c.sections::text) > 0
         OR position(OLD.url IN c.settings::text) > 0
         OR position(OLD.object_path IN c.sections::text) > 0
         OR position(OLD.object_path IN c.settings::text) > 0
         OR (OLD.webp_object_path IS NOT NULL AND (
           position(OLD.webp_object_path IN c.sections::text) > 0
           OR position(OLD.webp_object_path IN c.settings::text) > 0
         ))
         OR (OLD.thumbnail_object_path IS NOT NULL AND (
           position(OLD.thumbnail_object_path IN c.sections::text) > 0
           OR position(OLD.thumbnail_object_path IN c.settings::text) > 0
         ))
         OR (OLD.display_object_path IS NOT NULL AND (
           position(OLD.display_object_path IN c.sections::text) > 0
           OR position(OLD.display_object_path IN c.settings::text) > 0
         ))
      UNION ALL
      SELECT 1 FROM website_config_drafts d
      WHERE position(OLD.url IN d.sections::text) > 0
         OR position(OLD.url IN d.settings::text) > 0
         OR position(OLD.object_path IN d.sections::text) > 0
         OR position(OLD.object_path IN d.settings::text) > 0
         OR (OLD.webp_object_path IS NOT NULL AND (
           position(OLD.webp_object_path IN d.sections::text) > 0
           OR position(OLD.webp_object_path IN d.settings::text) > 0
         ))
         OR (OLD.thumbnail_object_path IS NOT NULL AND (
           position(OLD.thumbnail_object_path IN d.sections::text) > 0
           OR position(OLD.thumbnail_object_path IN d.settings::text) > 0
         ))
         OR (OLD.display_object_path IS NOT NULL AND (
           position(OLD.display_object_path IN d.sections::text) > 0
           OR position(OLD.display_object_path IN d.settings::text) > 0
         ))
    ) INTO referenced;

    IF referenced THEN
      RAISE EXCEPTION 'Website media is still referenced by published or draft content'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS website_config_drafts_serialize_write ON website_config_drafts;
CREATE TRIGGER website_config_drafts_serialize_write
BEFORE INSERT OR UPDATE OR DELETE ON website_config_drafts
FOR EACH ROW EXECUTE FUNCTION website_config_drafts_serialize_write();

DROP TRIGGER IF EXISTS website_configs_publish_guard ON website_configs;
CREATE TRIGGER website_configs_publish_guard
BEFORE INSERT OR UPDATE ON website_configs
FOR EACH ROW EXECUTE FUNCTION website_configs_publish_guard();

DROP TRIGGER IF EXISTS website_media_reference_guard ON website_media;
CREATE TRIGGER website_media_reference_guard
BEFORE INSERT OR UPDATE OR DELETE ON website_media
FOR EACH ROW EXECUTE FUNCTION website_media_reference_guard();

COMMIT;
