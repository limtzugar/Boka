import gzip, tarfile, io, os

src = "/home/z/my-project/upload/BOKA-OS-Setup(9).exe"
out_dir = "/home/z/my-project/boka-extract"

with open(src, "rb") as f:
    f.seek(0x1d55c0)
    blob = f.read()

print(f"Extracted blob size: {len(blob)} bytes")

# Try to decompress
try:
    decompressed = gzip.decompress(blob)
    print(f"Decompressed size: {len(decompressed)} bytes")
    # Save raw tar
    raw_tar_path = "/home/z/my-project/scripts/boka-os-source.tar"
    with open(raw_tar_path, "wb") as out:
        out.write(decompressed)
    print(f"Saved raw tar to {raw_tar_path}")

    # List contents
    tf = tarfile.open(fileobj=io.BytesIO(decompressed))
    members = tf.getmembers()
    print(f"\nTotal members: {len(members)}")
    print("\nFirst 50 entries:")
    for m in members[:50]:
        print(f"  {m.size:>10}  {m.name}")
except Exception as e:
    print(f"Error: {e}")
