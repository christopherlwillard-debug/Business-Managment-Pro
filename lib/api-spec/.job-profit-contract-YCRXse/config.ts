import { defineConfig } from "orval";

const titleTransformer = (config) => {
  config.info ??= {};
  config.info.title = "Api";
  return config;
};

export default defineConfig({
  "api-client-react": {
    input: {
      target: "/home/runner/workspace/lib/api-spec/openapi.yaml",
      override: { transformer: titleTransformer },
    },
    output: {
      workspace: "/tmp/buildpro-job-profit-contract-wVrIrd/api-client-react/src",
      target: "generated",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      prettier: true,
      override: {
        fetch: { includeHttpResponseReturnType: false },
        mutator: {
          path: "/tmp/buildpro-job-profit-contract-wVrIrd/api-client-react/src/custom-fetch.ts",
          name: "customFetch",
        },
      },
    },
  },
  zod: {
    input: {
      target: "/home/runner/workspace/lib/api-spec/openapi.yaml",
      override: { transformer: titleTransformer },
    },
    output: {
      workspace: "/tmp/buildpro-job-profit-contract-wVrIrd/api-zod/src",
      client: "zod",
      target: "generated",
      schemas: { path: "generated/types", type: "typescript" },
      mode: "split",
      clean: true,
      prettier: true,
      override: {
        zod: {
          coerce: {
            query: ["boolean", "number", "string"],
            param: ["boolean", "number", "string"],
          },
        },
        useDates: true,
      },
    },
  },
});
