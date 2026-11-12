import zlib
import struct
import math
import os

def make_png(width, height, rgba_data):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw.extend(rgba_data[y * width * 4 : (y + 1) * width * 4])
    idat = zlib.compress(bytes(raw), 9)
    return header + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')

def clamp255(v):
    return max(0, min(255, int(v)))

def render_rustcraft_icon(size):
    w = size
    h = size
    buf = bytearray(w * h * 4)

    for y in range(h):
        for x in range(w):
            idx = (y * w + x) * 4
            nx = (x + 0.5) / w * 2.0 - 1.0
            ny = (y + 0.5) / h * 2.0 - 1.0

            p = 4.5
            dist = (abs(nx)**p + abs(ny)**p)**(1.0 / p)

            if dist > 0.94:
                buf[idx] = 0
                buf[idx+1] = 0
                buf[idx+2] = 0
                buf[idx+3] = 0
                continue

            alpha = 1.0
            if dist > 0.88:
                alpha = (0.94 - dist) / 0.06

            t_grad = (ny + 1.0) * 0.5
            bg_r = 20 + 15 * t_grad
            bg_g = 22 + 18 * t_grad
            bg_b = 38 + 30 * t_grad

            if dist > 0.82:
                edge_t = (dist - 0.82) / 0.06
                bg_r = bg_r * (1 - edge_t) + 79 * edge_t
                bg_g = bg_g * (1 - edge_t) + 70 * edge_t
                bg_b = bg_b * (1 - edge_t) + 229 * edge_t

            cx = nx
            cy = ny - 0.05

            L = 0.52
            H = 0.30
            BH = 0.50

            in_cube = False
            cr, cg, cb = bg_r, bg_g, bg_b

            if (abs(cx) / L + abs(cy + 0.22) / H) <= 1.0:
                in_cube = True
                ft = (cx / L + 1.0) * 0.5
                cr = 245 + (251 - 245) * ft
                cg = 110 + (146 - 110) * ft
                cb = 25 + (60 - 25) * ft

                u = (cx / L + (cy + 0.22) / H) * 1.5
                v = (-cx / L + (cy + 0.22) / H) * 1.5
                if abs(u - round(u)) < 0.08 or abs(v - round(v)) < 0.08:
                    cr = cr * 0.88
                    cg = cg * 0.88
                    cb = cb * 0.88

            elif cx < 0 and abs(cx) <= L:
                top_y = -0.22 - (cx / L) * H
                bot_y = top_y + BH
                if top_y <= cy <= bot_y:
                    in_cube = True
                    depth_t = (cy - top_y) / BH
                    cr = 194 - 40 * depth_t
                    cg = 65 - 15 * depth_t
                    cb = 12

                    if abs(cx + 0.26) < 0.06 and (top_y + 0.12 <= cy <= bot_y - 0.12):
                        cr, cg, cb = 6, 182, 212

            elif cx >= 0 and abs(cx) <= L:
                top_y = -0.22 + (cx / L) * H
                bot_y = top_y + BH
                if top_y <= cy <= bot_y:
                    in_cube = True
                    depth_t = (cy - top_y) / BH
                    cr = 217 - 35 * depth_t
                    cg = 119 - 25 * depth_t
                    cb = 15

                    if abs(cx - 0.26) < 0.06 and (top_y + 0.12 <= cy <= bot_y - 0.12):
                        cr, cg, cb = 14, 165, 233

            if in_cube:
                buf[idx] = clamp255(cr)
                buf[idx+1] = clamp255(cg)
                buf[idx+2] = clamp255(cb)
                buf[idx+3] = clamp255(255 * alpha)
            else:
                buf[idx] = clamp255(bg_r)
                buf[idx+1] = clamp255(bg_g)
                buf[idx+2] = clamp255(bg_b)
                buf[idx+3] = clamp255(255 * alpha)

    return make_png(w, h, buf)

    return make_png(w, h, buf)

def make_ico(png_sizes_data):
    # ICO header: 6 bytes (idReserved=0, idType=1, idCount=len)
    header = struct.pack('<HHH', 0, 1, len(png_sizes_data))
    entries = bytearray()
    images = bytearray()
    offset = 6 + 16 * len(png_sizes_data)

    for (w, h, data) in png_sizes_data:
        bw = 0 if w >= 256 else w
        bh = 0 if h >= 256 else h
        bColorCount = 0
        bReserved = 0
        wPlanes = 1
        wBitCount = 32
        dwBytesInRes = len(data)
        dwImageOffset = offset

        entry = struct.pack('<BBBBHHII', bw, bh, bColorCount, bReserved, wPlanes, wBitCount, dwBytesInRes, dwImageOffset)
        entries.extend(entry)
        images.extend(data)
        offset += len(data)

    return header + entries + images

sizes = [16, 24, 32, 48, 64, 128, 256, 512]
png_data = {}
for s in sizes:
    png = render_rustcraft_icon(s)
    png_data[s] = png
    path = f"packaging/icons/hicolor/{s}x{s}/apps/horizon.png"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)
    print(f"Wrote {path} ({s}x{s})")

# Also write rustcraft.png copies
for s in sizes:
    path = f"packaging/icons/hicolor/{s}x{s}/apps/rustcraft.png"
    with open(path, "wb") as f:
        f.write(png_data[s])

# Write ICO file containing 16, 24, 32, 48, 64, 128, 256
ico_list = [(s, s, png_data[s]) for s in [16, 24, 32, 48, 64, 128, 256]]
ico = make_ico(ico_list)
with open("packaging/icons/horizon.ico", "wb") as f:
    f.write(ico)
with open("packaging/icons/rustcraft.ico", "wb") as f:
    f.write(ico)
print("Wrote packaging/icons/horizon.ico and rustcraft.ico")
