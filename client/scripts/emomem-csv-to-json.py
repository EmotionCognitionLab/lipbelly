# Given a CSV file with columns Set, Valence (aka emotion), and file id,
# (in that order) parses it and prints out a JSON file organized as:
# {
#   set1: {
#       emotion1: [ file id 1, file id 2, ...],
#       emotion2: [ file id 1, file id 2, ....],
#       ...
#   },
#   set2: {
#       emotion1: [ file id 1, file id 2, ....],
#       ...
#   },
#   ...
# }
# Usage: python emomem-csv-to-json.py --emopics <csv file>

import csv
import json


root = {}
def get_set_obj(set_name):
    if set_name != 'A' and set_name != 'B' and set_name != 'C':
        raise Exception(f'Expected set_name to be A, B, or C but got {set_name}.')
    
    return root.get(set_name, {})

def get_emo_list(set_obj, emo_name):
    if emo_name != 'Positive' and emo_name != 'Negative' and emo_name != 'Neutral':
        raise Exception(f'Expected emo_name to be Positive, Negative, or Neutral but got "{emo_name}".')

    return set_obj.get(emo_name, [])

def validate():
    root_keys = root.keys()
    if len(root_keys) != 3:
        raise Exception(f'Expected 3 different lists of images, but found {len(root_keys)}.')
    
    if 'A' not in root_keys or 'B' not in root_keys or 'C' not in root_keys:
        raise Exception(f'Expected A, B, and C lists of images but found {root_keys.join(",")}.')

    for k in root_keys:
        emo_keys = root[k].keys()
        if len(emo_keys) != 3:
            raise Exception(f'Expected 3 different emotions in list {k}, but found {len(emo_keys)}.')

        if 'Positive' not in emo_keys or 'Negative' not in emo_keys or 'Neutral' not in emo_keys:
            raise Exception(f'Expected Positive, Negative, and Neutral lists of images but found {emo_keys.join(",")}.')

        for ek in emo_keys:
            if len(root[k][ek]) != 14:
                raise Exception(f'Expected 14 {ek} images in list {k}, but found {len(root[k][ek])}.')

def _parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--emopics', help='CSV file of emotional memory pictures', dest='emo_pics', required=True)
    args = parser.parse_args()
    return args

def _main(args):
    
    with open(args.emo_pics) as csvfile:
        reader = csv.reader(csvfile)
        for row in reader:
            set_obj = get_set_obj(row[0])
            emo_list = get_emo_list(set_obj, row[1])
            emo_list.append(f'{row[2]}.jpg')
            set_obj[row[1]] = emo_list
            root[row[0]] = set_obj
            
        validate()
        print(json.dumps(root))

if __name__ == '__main__':
    import argparse

    _main(_parse_args())