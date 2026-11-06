# 裁掉透明边，打包成 data URI（file:// 下 WebGL 不能直接用本地图片做纹理）
import base64, io, json, sys
from PIL import Image
import os
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'game', 'assets')
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(base, 'sprites')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(base, 'sprites.js')
names = ['knight','slime','crow','cultist','mushroom','golem','revenant','king']
data = {}
for n in names:
    im = Image.open(f'{src}/{n}.png').convert('RGBA')
    bb = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    im = im.crop(bb)
    buf = io.BytesIO(); im.save(buf, 'PNG', optimize=True)
    data[n] = {'w': im.width, 'h': im.height, 'src': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()}
    print(n, im.size)
with open(out, 'w', encoding='utf8') as f:
    f.write('// 由 PixelLab 生成的角色精灵（已裁边），自动打包，勿手改\nconst SPRITES = ' + json.dumps(data) + ';\n')
