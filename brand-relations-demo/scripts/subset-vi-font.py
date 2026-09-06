"""Build the VI app font subset. Requires fonttools and brotli; keeps source fonts intact."""
from pathlib import Path
from fontTools import subset
root = Path(__file__).resolve().parent.parent
chars = set(range(32,127)) | set(range(0x3000,0x3040))
for file in (root / 'src').rglob('*'):
    if file.suffix in {'.tsx', '.ts', '.css', '.json'}:
        chars.update(ord(c) for c in file.read_text() if ord(c) > 127)
options = subset.Options()
options.flavor = 'woff2'
font = subset.load_font(str(root / 'public/vi/fonts/NotoSansSC-variable.ttf'), options)
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=chars)
subsetter.subset(font)
output = root / 'public/vi/fonts/NotoSansSC-app-subset.woff2'
subset.save_font(font, str(output), options)
print(f'App subset: {output.stat().st_size:,} bytes; other characters use the system fallback.')
