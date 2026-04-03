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

        # Target `.btn { ... transition: ... }` and `.play-call-btn`
        content = re.sub(
            r'(\.btn\s*\{[^}]*transition:\s*all\s*)[^;]+;',
            r'\1 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);',
            content
        )

        content = re.sub(
            r'(\.play-call-btn\s*\{[^}]*transition:\s*all\s*)[^;]+;',
            r'\1 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);',
            content
        )

        content = re.sub(
            r'(\.nav-pill\s*\{[^}]*transition:\s*all\s*)[^;]+;',
            r'\1 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);',
            content
        )

        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Patched {filepath}")
    except Exception as e:
        print(f"Failed {filepath}: {e}")

for f in files_to_patch:
    patch_file(f)
