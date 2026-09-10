from pathlib import Path
import fitz

files = sorted(Path('attached_assets').glob('*invoice_*.pdf'))
out = Path('.agents/outputs/invoice-renders')
out.mkdir(parents=True, exist_ok=True)
for path in files:
    doc = fitz.open(path)
    print(f'{path}: {doc.page_count} page(s), metadata={doc.metadata}')
    for index, page in enumerate(doc):
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        target = out / f'{path.stem}-page-{index+1}.png'
        pix.save(target)
        print(f'  rendered {target} ({pix.width}x{pix.height})')
