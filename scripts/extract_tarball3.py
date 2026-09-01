import gzip, tarfile, io, os

src = "/home/z/my-project/upload/BOKA-OS-Setup(9).exe"
out_dir = "/home/z/my-project/boka-extract"
os.makedirs(out_dir, exist_ok=True)

with open(src, "rb") as f:
    f.seek(0x1d55c0)
    blob = f.read()

print(f"Blob size: {len(blob)} bytes")
print(f"First 16 bytes: {blob[:16].hex()}")

# Use GzipFile which handles end-of-stream correctly
try:
    gf = gzip.GzipFile(fileobj=io.BytesIO(blob))
    decompressed = gf.read()
    print(f"Decompressed size: {len(decompressed)} bytes")
    print(f"First 16 bytes of decompressed: {decompressed[:16].hex()}")
    print(f"First 100 bytes as text: {decompressed[:100]}")

    # Save the tar
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
except Exception as e:
    import traceback
    traceback.print_exc()
