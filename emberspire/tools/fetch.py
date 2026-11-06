# 下载 PixelLab 候选图并拼成对比图：python fetch.py name=jobid ...
import sys, time, urllib.request, io, os
from PIL import Image, ImageDraw
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'work')); os.makedirs('cand', exist_ok=True)
rows = []
for arg in sys.argv[1:]:
    name, job = arg.split('=')
    ims = []
    for i in range(4):
        p = f'cand/{name}_{i}.png'
        if not os.path.exists(p):
            url = f'https://api.pixellab.ai/mcp/images/{job}/download?index={i}'
            for _ in range(40):
                try:
                    data = urllib.request.urlopen(url, timeout=30).read()
                    open(p, 'wb').write(data); break
                except urllib.error.HTTPError as e:
                    if e.code == 423: time.sleep(8); continue
                    raise
        ims.append(Image.open(p).convert('RGBA'))
    rows.append((name, ims))
    print('ok', name, flush=True)
S = 2; w, h = rows[0][1][0].size
sheet = Image.new('RGBA', (110 + 4 * (w * S + 8), len(rows) * (h * S + 8)), (30, 24, 20, 255))
d = ImageDraw.Draw(sheet)
for r, (name, ims) in enumerate(rows):
    y = r * (h * S + 8)
    d.text((4, y + h * S // 2), name, fill=(240, 220, 190, 255))
    for i, im in enumerate(ims):
        x = 110 + i * (w * S + 8)
        sheet.alpha_composite(im.resize((w * S, h * S), Image.NEAREST), (x, y))
        d.text((x + 3, y + 2), str(i), fill=(255, 255, 0, 255))
sheet.save('sheet.png'); print('sheet', sheet.size)
