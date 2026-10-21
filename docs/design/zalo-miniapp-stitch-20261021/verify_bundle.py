"""Bounded integrity checks for this design handoff; never executes exported HTML."""
from pathlib import Path
from zipfile import ZipFile
from collections import Counter
from urllib.parse import unquote, urlsplit
import argparse
import hashlib
import json
import re
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--handoff-only', action='store_true',
                        help='also restrict staged paths to this docs bundle')
    args = parser.parse_args()
    bundle = Path(__file__).resolve().parent
    repo = bundle.parents[2]
    manifest = json.loads((bundle / 'source-manifest.json').read_text(encoding='utf-8'))
    archive = bundle / 'source-archive' / manifest['source_archive']
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == manifest['source_sha256']
    assert manifest['file_count'] == len(manifest['files']) == 175
    assert len({r['path'].casefold() for r in manifest['files']}) == 175
    assert sum(r['bytes'] for r in manifest['files']) < 100 * 1024 * 1024
    with ZipFile(archive) as zipped:
        for record in manifest['files']:
            path = (bundle / record['path']).resolve()
            assert path.is_relative_to(bundle)
            data = path.read_bytes()
            assert len(data) == record['bytes']
            assert hashlib.sha256(data).hexdigest() == record['sha256'], record['path']
            assert data == zipped.read(record['archive_path']), record['path']
    htmls = sorted((bundle / 'stitch-export').glob('*/code.html'))
    pngs = sorted((bundle / 'stitch-export').glob('*/screen.png'))
    assert len(htmls) == len(pngs) == 87
    assert {f.parent for f in htmls} == {f.parent for f in pngs}
    codes = Counter()
    for html in htmls:
        match = re.match(r'm(\d{2})_', html.parent.name)
        codes['M' + match.group(1) if match else 'EXPLORATION'] += 1
    assert codes['EXPLORATION'] == 4
    assert all(codes[f'M{i:02d}'] == manifest['screens_per_page'][f'M{i:02d}']
               for i in range(1, 25))
    prompt = (bundle / 'prompts/24-screen-prompts.md').read_text(encoding='utf-8')
    assert re.findall(r'^### (M\d{2}) —', prompt, re.M) == [f'M{i:02d}' for i in range(1, 25)]
    mapping = (bundle / 'SCREEN-MAP.md').read_text(encoding='utf-8')
    assert re.findall(r'^## (M\d{2}) —', mapping, re.M) == [f'M{i:02d}' for i in range(1, 25)]
    for target in re.findall(r'Đích: `([^`]+)`', mapping):
        assert target.startswith('zalo-mini-app/src/pages/')
        assert (repo / target).is_file(), target
    # Archived documents and generated source preserve their original references.
    # Only links in the authored handoff are checked against this repository.
    checked_links = 0
    for md in sorted(bundle.glob('*.md')):
        text = md.read_text(encoding='utf-8')
        assert '\ufffd' not in text, md.name
        for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', text):
            target = target.strip('<>')
            if urlsplit(target).scheme or target.startswith('#'):
                continue
            local = (md.parent / unquote(target.split('#')[0])).resolve()
            assert local.is_relative_to(repo) and local.exists(), (md.name, target)
            checked_links += 1
    patterns = [r'gh[pousr]_[A-Za-z0-9]{30,}', r'github_pat_[A-Za-z0-9_]{40,}',
                r'AIza[0-9A-Za-z_-]{35}', r'AKIA[0-9A-Z]{16}',
                r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----']
    scanned = 0
    for f in bundle.rglob('*'):
        if f.suffix.lower() not in {'.md', '.html', '.json'}:
            continue
        text = f.read_text(encoding='utf-8')
        for pattern in patterns:
            assert not re.search(pattern, text), f'Secret-like pattern in {f.relative_to(bundle)}'
        scanned += 1
    if args.handoff_only:
        changed = subprocess.check_output(
            ['git', 'diff', '--cached', '--name-only', '-z'], cwd=repo).split(b'\0')
        prefix = bundle.relative_to(repo).as_posix() + '/'
        assert all(name.decode('utf-8').startswith(prefix) for name in changed if name)
    print(json.dumps({'result': 'PASS', 'screens': 87, 'tagged_frames': 83,
                      'explorations': 4, 'pages': 24, 'source_files': 175,
                      'local_links_checked': checked_links, 'text_files_scanned': scanned,
                      'scope': 'design handoff only; not runtime or device tests'}))


if __name__ == '__main__':
    main()
