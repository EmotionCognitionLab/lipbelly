/**
 * Randomly selects the emotional memory pictures that a participant will see.
 * The pictures are organized into three groups (A, B, and C) with 42 pictures each.
 * Each picture is either neutral, positive or negative.
 * We first randomly pick (without replacement) two of the three groups. We then
 * pick (without replacement) two neutral, two positive and two negative pictures
 * from those two groups and shuffle them (so that the participant doesn't always see two
 * neutral pictures followed by two positive pictures, for example). We record those six
 * (including which group each picture was part of) and then repeat the process until
 *  we've selected 84 images in total.
 */

import imgData from './emopics.json'
import {initJsPsych} from 'jspsych'

const jspsych = initJsPsych();
const shuffle = jspsych.randomization.shuffle;
const sampleWithoutReplacement = jspsych.randomization.sampleWithoutReplacement;

export function generateEmotionalImages() {
    const groups = ['A', 'B', 'C'];
    const selectedGroups = sampleWithoutReplacement(groups, 2);
    const neut = shuffle(imgData['Neutral'].filter(img => selectedGroups.includes(img.group)));
    const neg = shuffle(imgData['Negative'].filter(img => selectedGroups.includes(img.group)));
    const pos = shuffle(imgData['Positive'].filter(img => selectedGroups.includes(img.group)));
    const selectedImgs = [];

    while (selectedImgs.length < 84) {
        const tmp = [];
        tmp.push(neut.pop()); tmp.push(neut.pop());
        tmp.push(neg.pop()); tmp.push(neg.pop());
        tmp.push(pos.pop()); tmp.push(pos.pop());
        selectedImgs.push(...shuffle(tmp));
    }

    return selectedImgs;
}