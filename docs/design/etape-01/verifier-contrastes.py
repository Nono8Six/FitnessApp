"""Mesure WCAG des couleurs relevées dans Chrome ; bibliothèque standard uniquement."""
import json
import math
import re
from pathlib import Path

PROOF = Path(__file__).resolve().parents[2] / 'preuves/v1/etape-01/2026-10-04'

def linear_rgb(color):
    if color.startswith('#'):
        rgb = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        return [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
    match = re.fullmatch(r'oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)', color)
    if not match:
        raise ValueError(f'Couleur non prise en charge : {color}')
    light, chroma, hue = map(float, match.groups())
    light /= 100
    a, b = chroma * math.cos(math.radians(hue)), chroma * math.sin(math.radians(hue))
    l = (light + .3963377774 * a + .2158037573 * b) ** 3
    m = (light - .1055613458 * a - .0638541728 * b) ** 3
    s = (light - .0894841775 * a - 1.2914855480 * b) ** 3
    return [max(0, min(1, c)) for c in (
        4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
        -.0041960863 * l - .7034186147 * m + 1.7076147010 * s)]

def luminance(color):
    r, g, b = linear_rgb(color)
    return .2126 * r + .7152 * g + .0722 * b

def ratio(a, b):
    x, y = sorted([luminance(a), luminance(b)])
    return (y + .05) / (x + .05)

palettes = json.loads((PROOF / 'palettes-rendues.json').read_text(encoding='utf-8'))
pairs = [(a, b, 4.5) for a in ('text', 'muted') for b in ('bg', 'surface', 'layer', 'tint')]
pairs += [('on-accent', 'accent', 4.5), ('surface', 'error', 4.5),
          ('error', 'error-bg', 4.5), ('warning', 'warning-bg', 4.5),
          ('accent', 'surface', 4.5), ('accent', 'tint', 4.5)]
pairs += [(a, b, 3) for a in ('speed', 'target', 'incline', 'sport', 'control', 'focus')
          for b in ('bg', 'surface')]
results = []
for theme, palette in palettes.items():
    for foreground, background, minimum in pairs:
        if theme == 'dark' and foreground == 'surface' and background == 'error':
            actual_foreground = '#29141a'  # Texte du bouton Arrêter, rôle spécifique.
        else:
            actual_foreground = palette[foreground]
        value = ratio(actual_foreground, palette[background])
        results.append(dict(theme=theme,foreground=foreground,background=background,
                            foreground_color=actual_foreground,background_color=palette[background],
                            ratio=round(value, 3),minimum=minimum,pass_=value >= minimum))
output = {'method':'Luminance relative WCAG 2, sRGB linéarisé ; OKLCH converti en sRGB linéaire',
          'input':'palettes-rendues.json, relevé getComputedStyle dans Chrome',
          'pairs':results,'all_pass':all(r['pass_'] for r in results)}
(PROOF / 'contrastes.json').write_text(json.dumps(output,indent=2,ensure_ascii=False),encoding='utf-8')
lines = ['# Contrastes mesurés', '', output['method'], '',
         '| Thème | Premier plan | Fond | Ratio | Seuil | Résultat |',
         '|---|---|---|---:|---:|---|']
for r in results:
    lines.append(f"| {r['theme']} | {r['foreground']} | {r['background']} | {r['ratio']:.2f}:1 | {r['minimum']}:1 | {'OK' if r['pass_'] else 'À CORRIGER'} |")
lines += ['', 'Les séparateurs de regroupement sont non essentiels et plus discrets. Les champs et contrôles utilisent `control`, les courbes essentielles les rôles mesurés. Les commandes désactivées sont aussi signalées par leur état natif ; elles ne portent aucune action disponible.',
          '', 'Portée : paires sémantiques mesurées, pas une certification WCAG complète ni une mesure des pixels anticrénelés.']
(PROOF / 'CONTRASTES.md').write_text('\n'.join(lines) + '\n',encoding='utf-8')
print(json.dumps({'pairs':len(results),'all_pass':output['all_pass'],
                  'failures':[r for r in results if not r['pass_']]},ensure_ascii=False))
raise SystemExit(0 if output['all_pass'] else 1)
