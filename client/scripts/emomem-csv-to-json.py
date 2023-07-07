# Given a CSV file with columns Set, Valence (aka emotion), and file id,
# (in that order) parses it and prints out a JSON file organized as:
# {
#   emotion1: [
#       {file: id1, set: set1},
#       {file: id2, set: set1}
#       ...
#       {file: id15, set: set2},
#       ...
#   ],
#   emotion2: [
#       {file: id1, set: set1},
#       {file: id2, set: set1}
#       ...
#       {file: id15, set: set2},
#       ...
#   ],
#   ...
# }
# Usage: python emomem-csv-to-json.py --emopics <csv file>

import csv
import json


root = {}

def get_emo_list(emo_name):
    if emo_name != 'Positive' and emo_name != 'Negative' and emo_name != 'Neutral':
        raise Exception(f'Expected emo_name to be Positive, Negative, or Neutral but got "{emo_name}".')

    return root.get(emo_name, [])

def validate():
    root_keys = root.keys()
    if len(root_keys) != 3:
        raise Exception(f'Expected 3 different emotions, but found {len(root_keys)}.')
    
    if 'Positive' not in root_keys or 'Negative' not in root_keys or 'Neutral' not in root_keys:
        raise Exception(f'Expected Positive, Negative, and Neutral lists of images but found {root_keys.join(",")}.')

    for k in root_keys:
        emo_files = root[k]
        if len(emo_files) != 42:
            raise Exception(f'Expected 28 different {k} files, but found {len(emo_files)}.')

def _parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--emopics', help='CSV file of emotional memory pictures', dest='emo_pics', required=True)
    args = parser.parse_args()
    return args

def _main(args):
    
    with open(args.emo_pics) as csvfile:
        reader = csv.reader(csvfile)
        for row in reader:
            emo_list = get_emo_list(row[1])
            emo_list.append({'file': f'{row[2]}.jpg', 'set': row[0]})
            root[row[1]] = emo_list
            
        validate()
        print(json.dumps(root))

if __name__ == '__main__':
    import argparse

    _main(_parse_args())