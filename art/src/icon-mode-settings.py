import numpy as np
from PIL import Image, ImageFilter
S=4; W=84*S; c=W/2
y,x=np.mgrid[0:W,0:W]+0.5; dx=x-c; dy=y-c; r=np.hypot(dx,dy); a=np.arctan2(dy,dx)
T=8; Rb=22.5*S; Rt=30.5*S; Rh=8.5*S
# teeth: angular width tapered (wider at root)
ph=((a+np.pi/T/2) % (2*np.pi/T)) - np.pi/T   # -pi/T..pi/T, tooth centred at 0 offset
frac=np.abs(ph)/(np.pi/T)                       # 0 at tooth centre, 1 between teeth
tooth=(r<Rt)&(frac<np.interp(r,[Rb,Rt],[0.52,0.36]))
shape=((r<Rb)|tooth)&(r>Rh)
def blur_mask(m,rad): return np.array(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(rad)))>127
outl=blur_mask(shape,2*2*S+1)
shadow=np.roll(np.roll(outl,3*S,0),2*S,1)&~outl
img=np.zeros((W,W,4),float)
img[shadow]=[20,10,6,150]
img[outl]=[34,18,12,255]
# metal fill: light top-left to dark bottom-right
t=np.clip(((dx+dy)/(2*Rt))*0.5+0.5,0,1)
light=np.array([246,200,130]); base=np.array([214,158,100]); dark=np.array([170,112,66])
col=np.where(t[...,None]<0.5, light+(base-light)*(t[...,None]/0.5), base+(dark-base)*((t[...,None]-0.5)/0.5))
# bevel: groove ring and darker rim around the hole, highlight on the inner ring's top-left
groove=(np.abs(r-15.8*S)<1.2*S)
col[groove]=col[groove]*0.62
holeRim=(r>Rh)&(r<Rh+2.2*S); col[holeRim]=col[holeRim]*0.7
hi=(np.abs(r-17.2*S)<0.9*S)&((dx+dy)<0); col[hi]=np.minimum(255,col[hi]*1.18)
# tooth tops a touch lighter on the lit side
tops=shape&(r>Rb+1*S)&((dx+dy)<0); col[tops]=np.minimum(255,col[tops]*1.06)
img[shape,:3]=col[shape]; img[shape,3]=255
im=Image.fromarray(img.astype(np.uint8),'RGBA')
# premultiplied downsample
pm=im.convert('RGBa').resize((84,84),Image.LANCZOS).convert('RGBA')
pm.save('icon-mode-settings.png'); pm.save('icon-mode-settings.webp',lossless=True,method=6)
pm.resize((336,336),Image.NEAREST).save('preview.png')
