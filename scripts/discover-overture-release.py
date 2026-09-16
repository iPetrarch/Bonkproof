#!/usr/bin/env python3
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

BUCKET_LIST_URL = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/'
RELEASE_PATTERN = re.compile(r'^release/(\d{4}-\d{2}-\d{2}\.\d+)/$')


def main():
    query = urllib.parse.urlencode({'list-type': '2', 'delimiter': '/', 'prefix': 'release/'})
    request = urllib.request.Request(f'{BUCKET_LIST_URL}?{query}', headers={'User-Agent': 'Bonkproof/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        root = ET.fromstring(response.read())

    releases = []
    for node in root.iter():
        if node.tag.rsplit('}', 1)[-1] != 'Prefix' or not node.text:
            continue
        match = RELEASE_PATTERN.match(node.text)
        if match:
            releases.append(match.group(1))

    if not releases:
        raise RuntimeError('No Overture releases found in the public bucket listing.')
    print(max(releases))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Could not discover latest Overture release: {error}', file=sys.stderr)
        raise
