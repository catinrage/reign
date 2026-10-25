"""Cuts the trailer from the recorded frame folders: picture, captions, title cards, music and sound.

Usage (from the repository root): python3 scripts/trailer/cut.py <recDir> <artDir> <out.mp4>
<recDir> holds the clip folders from record.mjs, <artDir> the cards and captions from art.mjs.
Which frames of which clip go where, and the sound effects, are in cut.json next to this file.
Cuts land on the bars of the tavern track (79.5 BPM, a bar every 3.019 s). Needs ffmpeg.
"""
import json, os, subprocess, sys

rec, art, out = sys.argv[1:4]
work = os.path.join(os.path.dirname(out), '_edit')
os.makedirs(work, exist_ok=True)
SFX = 'src/client/public/sfx'
FPS = 30
BEAT = 60 / 79.507
BAR = BEAT * 4
LEAD = BEAT * 2  # the first downbeat lands two beats in
MUSIC_AT = 38.41 - LEAD  # where in the track the trailer starts


def run(cmd):
    print(' '.join(cmd)[:300])
    subprocess.run(cmd, check=True)


def bar(n):
    return LEAD + n * BAR


cfg = json.load(open(os.environ.get('CUT') or os.path.join(os.path.dirname(__file__), 'cut.json')))
segs = cfg['segments']
END = cfg['end']  # seconds the whole trailer runs

parts = []
t = 0.0
for i, s in enumerate(segs):
    start = 0 if i == 0 else bar(s['from'])
    stop = bar(s['to'])
    n = round(stop * FPS) - round(start * FPS)
    folder = os.path.join(rec, s['clip'])
    seg = os.path.join(work, f'seg{i:02d}.mp4')
    vf = [f'trim=start_frame={s["first"]}:end_frame={s["first"] + n}', 'setpts=PTS-STARTPTS']
    if s.get('speed'):
        vf = [f'trim=start_frame={s["first"]}', f'setpts=(PTS-STARTPTS)/{s["speed"]}', f'trim=end_frame={n}', 'setpts=PTS-STARTPTS']
    inputs = ['-framerate', str(FPS), '-i', os.path.join(folder, '%04d.jpg')]
    graph = f'[0:v]{",".join(vf)},format=rgba[v0]'
    last = 'v0'
    if s.get('caption'):
        dur = n / FPS
        cap = os.path.join(art, f'{s["caption"]}.png')
        inputs += ['-loop', '1', '-t', f'{dur:.3f}', '-i', cap]
        # Slides in from the left, holds, then fades away before the cut.
        graph += (
            f';[1:v]format=rgba,fade=t=in:st=0.12:d=0.25:alpha=1,fade=t=out:st={dur - 0.45:.3f}:d=0.3:alpha=1[c]'
            f';[{last}][c]overlay=x=\'if(lt(t,0.12),-300,-300+300*min(1,(t-0.12)/0.3)*(2-min(1,(t-0.12)/0.3)))\':y=0:format=auto[v1]'
        )
        last = 'v1'
    if s.get('flash'):
        graph += f';[{last}]fade=t=in:st=0:d=0.2:color=white[v2]'
        last = 'v2'
    graph += f';[{last}]format=yuv420p[out]'
    run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', graph, '-map', '[out]', '-frames:v', str(n),
         '-r', str(FPS), '-c:v', 'libx264', '-crf', '12', '-preset', 'medium', seg])
    parts.append((seg, n))

# The end card over the last frame of the last shot, held and slowly pushed in.
last_seg = segs[-1]
end_start = bar(last_seg['to'])
end_n = round(END * FPS) - round(end_start * FPS)
lastframe = os.path.join(work, 'last.png')
run(['ffmpeg', '-v', 'error', '-y', '-sseof', '-0.1', '-i', parts[-1][0], '-frames:v', '1', '-update', '1', lastframe])
endseg = os.path.join(work, 'segend.mp4')
d = end_n / FPS
run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-framerate', str(FPS), '-i', lastframe,
     '-loop', '1', '-framerate', str(FPS), '-i', os.path.join(art, 'card-end.png'),
     '-filter_complex',
     f'[0:v]scale=2400:-1,zoompan=z=\'1+0.04*on/{end_n}\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d={end_n}:s=1920x1080:fps={FPS},'
     f'gblur=sigma=\'6\',format=rgba[bg];'
     f'[1:v]format=rgba,fade=t=in:st=0:d=0.45:alpha=1[card];'
     f'[bg][card]overlay=0:0,fade=t=out:st={d - 0.7:.3f}:d=0.7,format=yuv420p[out]',
     '-map', '[out]', '-frames:v', str(end_n), '-c:v', 'libx264', '-crf', '12', endseg])
parts.append((endseg, end_n))

listfile = os.path.join(work, 'list.txt')
with open(listfile, 'w') as f:
    for p, _ in parts:
        f.write(f"file '{os.path.abspath(p)}'\n")
video = os.path.join(work, 'video.mp4')
run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listfile, '-c', 'copy', video])

# The logo over the opening crane shot.
logo_in, logo_out = cfg['logo']
titled = os.path.join(work, 'titled.mp4')
run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-loop', '1', '-t', str(logo_out + 0.6), '-i', os.path.join(art, 'card-logo.png'),
     '-filter_complex',
     f'[1:v]format=rgba,fade=t=in:st={logo_in}:d=0.5:alpha=1,fade=t=out:st={logo_out - 0.4}:d=0.4:alpha=1[l];'
     f'[0:v]format=rgba[b];[b][l]overlay=0:0:eof_action=pass,format=yuv420p[out]',
     '-map', '[out]', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', titled])

# Sound: music, the fireside, whooshes on captions and the game's own effects on what happens.
whoosh = os.path.join(work, 'whoosh.wav')
run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'anoisesrc=c=pink:d=0.7:a=0.6:r=48000',
     '-af', 'highpass=f=400,lowpass=f=5000,afade=t=in:d=0.45:curve=exp,afade=t=out:st=0.45:d=0.25,volume=0.5,aformat=channel_layouts=stereo', whoosh])
boom = os.path.join(work, 'boom.wav')
run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=55:d=1.4:r=48000', '-f', 'lavfi', '-i', 'anoisesrc=c=brown:d=1.4:a=0.5:r=48000',
     '-filter_complex', '[0][1]amix=inputs=2:weights=1 0.6,lowpass=f=220,afade=t=out:st=0.05:d=1.3:curve=exp,volume=2.2,aformat=channel_layouts=stereo', boom])

events = []  # (seconds, file, volume)
for i, s in enumerate(segs):
    start = 0 if i == 0 else bar(s['from'])
    if s.get('caption'):
        events.append((start + 0.02, whoosh, 0.55))
    for at_frame, name, vol in s.get('sfx', []):
        f = boom if name == 'boom' else whoosh if name == 'whoosh' else os.path.join(SFX, f'{name}.mp3')
        events.append((start + (at_frame - s['first']) / FPS, f, vol))
for at, name, vol in cfg.get('sfx', []):
    f = boom if name == 'boom' else os.path.join(SFX, f'{name}.mp3')
    events.append((at, f, vol))

ins = ['-ss', f'{MUSIC_AT:.3f}', '-i', 'src/client/public/music/tavern.mp3',
       '-stream_loop', '-1', '-i', os.path.join(SFX, 'ambience.mp3')]
graph = [f'[0:a]afade=t=in:d=0.6,volume={cfg.get("music", 0.95)},atrim=0:{END},afade=t=out:st={END - 1.2:.3f}:d=1.2[m]',
         f'[1:a]volume=0.22,atrim=0:{END},afade=t=in:d=1.5,afade=t=out:st={END - 1.5:.3f}:d=1.5[amb]']
labels = ['[m]', '[amb]']
for k, (at, f, vol) in enumerate(events):
    ins += ['-i', f]
    ms = max(0, round(at * 1000))
    graph.append(f'[{k + 2}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume={vol},adelay={ms}|{ms}[e{k}]')
    labels.append(f'[e{k}]')
graph.append(f'{"".join(labels)}amix=inputs={len(labels)}:normalize=0:duration=first,alimiter=limit=0.95,loudnorm=I=-14:TP=-1.5:LRA=11[a]')
audio = os.path.join(work, 'audio.wav')
run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', ';'.join(graph), '-map', '[a]', '-t', str(END), '-ar', '48000', audio])

run(['ffmpeg', '-v', 'error', '-y', '-i', titled, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
     '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-shortest', out])
print('wrote', out)
