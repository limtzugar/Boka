import zlib, io, os, tarfile

src = "/home/z/my-project/upload/BOKA-OS-Setup(9).exe"
out_dir = "/home/z/my-project/boka-extract"
os.makedirs(out_dir, exist_ok=True)

with open(src, "rb") as f:
    f.seek(0x1d55c0)
    blob = f.read()

print(f"Blob size: {len(blob)} bytes")

# Parse gzip header manually
# +0: 1f 8b magic
# +2: compression method (08 = deflate)
# +3: flags
# +4..7: mtime
# +8: XFL
# +9: OS
# Then optional fields based on flags
flags = blob[3]
print(f"Flags: 0x{flags:x}")
offset = 10
if flags & 0x08:  # FNAME
    end = blob.index(b'\x00', offset)
    fname = blob[offset:end].decode('ascii', errors='replace')
    print(f"FNAME: {fname}")
    offset = end + 1
if flags & 0x10:  # FCOMMENT
    end = blob.index(b'\x00', offset)
    offset = end + 1
if flags & 0x04:  # FEXTRA
    xlen = blob[offset] | (blob[offset+1] << 8)
    offset += 2 + xlen
if flags & 0x02:  # FHCRC
    offset += 2

print(f"Deflate data starts at offset {offset} (0x{offset:x})")

# Decompress using raw deflate (wbits=-15)
deflater = zlib.decompressobj(-15)
decompressed = deflater.decompress(blob[offset:])
decompressed += deflater.flush()
print(f"Decompressed size: {len(decompressed)} bytes")

# Save tar
tar_path = "/home/z/my-project/scripts/boka-os-source.tar"
with open(tar_path, "wb") as out:
    out.write(decompressed)

# List and extract
tf = tarfile.open(fileobj=io.BytesIO(decompressed))
members = tf.getmembers()
print(f"\nTotal tar members: {len(members)}")
print("\nFirst 40 entries:")
for m in members[:40]:
    kind = "DIR" if m.isdir() else ("LINK" if m.issym() or m.islnk() else "FILE")
    print(f"  [{kind}] {m.size:>10}  {m.name}")

# Extract everything
tf.extractall(out_dir)
print(f"\nExtracted to {out_dir}")
