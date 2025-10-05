import sys
from PIL import Image

if len(sys.argv) != 3:
    print("Usage: python convert_bmp.py input.bmp output.png")
    sys.exit(1)

input_path = sys.argv[1]
output_path = sys.argv[2]

try:
    img = Image.open(input_path)
    img.save(output_path, 'PNG')
    print(f"Converted {input_path} to {output_path}")
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)