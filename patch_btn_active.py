import re

files_to_patch = [
    "src/ui/styles/components.css",
    "src/ui/styles/style.css",
    "src/ui/styles/app-mobile.css"
]

def patch_file(filepath):
    try:
        with open(filepath, 'r') as f:
            content = f.read()

        content = re.sub(
            r'\.btn:hover\s*\{[^}]*\}',
            '.btn:hover {\n  transform: translateY(-2px);\n  box-shadow: var(--shadow-md);\n  border-color: var(--hairline-strong);\n  filter: brightness(1.05);\n}',
            content
        )
        content = re.sub(
            r'\.btn:active\s*\{[^}]*\}',
            '.btn:active {\n  transform: scale(0.96) translateY(1px);\n  filter: brightness(0.95);\n  box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);\n}',
            content
        )

        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Patched active/hover for {filepath}")
    except Exception as e:
        print(f"Failed {filepath}: {e}")

for f in files_to_patch:
    patch_file(f)
