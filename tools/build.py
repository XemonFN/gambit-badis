"""Construit index.html à partir de index.src.html + pieces.css.
Usage : python3 tools/build.py"""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'index.src.html').read_text(encoding='utf-8')
pieces = (root / 'pieces.css').read_text(encoding='utf-8')
head = '''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Badis Gambit">
<meta name="theme-color" content="#ffffff">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" type="image/png" href="icon-192.png">
<style>
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0}
img{max-width:100%}
[hidden]{display:none!important}
</style>
</head>
<body>
'''
out = head + src.replace('/*PIECES*/', pieces) + '\n</body>\n</html>\n'
(root / 'index.html').write_text(out, encoding='utf-8')
print('index.html construit :', len(out), 'octets')
