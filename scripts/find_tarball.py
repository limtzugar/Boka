import re

src = "/home/z/my-project/upload/BOKA-OS-Setup(9).exe"
with open(src, "rb") as f:
    data = f.read()

print(f"Total file size: {len(data)} bytes")

# Gzip magic: 1f 8b 08
magic = b"\x1f\x8b\x08"
positions = []
i = 0
while True:
    pos = data.find(magic, i)
    if pos == -1:
        break
    positions.append(pos)
    i = pos + 1

print(f"Found {len(positions)} gzip magic byte sequences")
for p in positions[:20]:
    print(f"  offset 0x{p:x} ({p})")
