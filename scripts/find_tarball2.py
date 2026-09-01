src = "/home/z/my-project/upload/BOKA-OS-Setup(9).exe"
with open(src, "rb") as f:
    data = f.read()

# tar magic: "ustar\0" at offset 257 in tar header, OR "ustar  \0" (GNU tar)
# Search for both
patterns = [b"ustar\x00", b"ustar  \x00"]
for pat in patterns:
    positions = []
    i = 0
    while True:
        pos = data.find(pat, i)
        if pos == -1:
            break
        positions.append(pos)
        i = pos + 1
    print(f"Pattern {pat!r}: {len(positions)} matches")
    for p in positions[:10]:
        # tar header starts 257 bytes before the magic
        tar_start = p - 257
        if tar_start < 0:
            tar_start = 0
        print(f"  magic at 0x{p:x}, tar header would start at 0x{tar_start:x}")

# Also search for the bytes b"\x1f\x8b" not followed by 0x01 0x00 (false positive)
# Proper gzip header: 1f 8b 08 [flags] [mtime 4 bytes] [xfl] [os]
print("\nSearching for valid gzip headers (1f 8b 08 + valid flag)...")
positions = []
i = 0
while True:
    pos = data.find(b"\x1f\x8b\x08", i)
    if pos == -1:
        break
    # Check the OS byte (last byte) - should be 0x00 (FAT), 0x03 (Unix), or 0x0b (NTFS)
    if pos + 9 < len(data):
        os_byte = data[pos + 9]
        if os_byte in (0x00, 0x03, 0x0b, 0x07):
            positions.append((pos, os_byte))
    i = pos + 1
print(f"Found {len(positions)} valid gzip headers")
for p, os_b in positions[:10]:
    print(f"  offset 0x{p:x}, OS byte 0x{os_b:x}")
