/**
 * Randomly selects the emotional memory pictures that a participant will see.
 
 */

import imgData from './emopics.json'
import awsSettings from '../../common/aws-settings.json'
import {initJsPsych} from 'jspsych'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc);
dayjs.extend(timezone);


const jspsych = initJsPsych();
const shuffle = jspsych.randomization.shuffle;
const sampleWithoutReplacement = jspsych.randomization.sampleWithoutReplacement;

/**
 * Pre-generates the list of all emotional images a participant will see over the course
 * of the entire experiment. The pictures are organized into three groups (A, B, and C) 
 * with 42 pictures each. Each picture is either neutral, positive or negative.
 * We first randomly pick (without replacement) two of the three groups. We then
 * pick (without replacement) two neutral, two positive and two negative pictures
 * from those two groups and shuffle them (so that the participant doesn't always see two
 * neutral pictures followed by two positive pictures, for example). We record those six
 * (including which group each picture was part of) and then repeat the process until
 *  we've selected 84 images in total.
 * @returns {Array<String>} Array of 84 image file names in the order required
 */
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

/**
 * Fetches the images to be shown to a user for a particular session.
 *
 * Under normal conditions this will always select the next six images that have not
 * yet been seen/rated. (We don't record when a user sees an image; only when s/he rates it.)
 * Things are more complicated when something goes wrong:
 * 1. A session has been interrupted and the user is resuming it that same day.
 * In this case we count the number of images the user rated in the interrupted session 
 * and return as many more as we need to for the user to rate a total of six images.
 * 2. A session has been interrupted and the user does not resume it that same day.
 * In this case the user cannot resume the session but must start a new one. That means
 * that the images that were not rated in the interrupted session must be marked as skipped
 * and the next six images in the list should be selected.
 */
export async function emotionalImagesForSession(apiClient) {
    const usedPics = await apiClient.getEmopics(true);
    const todayDate = dayjs().tz('America/Los_Angeles').format('YYYY-MM-DD');
    const usedToday = usedPics.filter(p => p.date.startsWith(todayDate) && !p.skipped);
    const nextUnused = await apiClient.getEmopics(false, 11); // 11 is the max we could possible need for one session - 5 skipped and six new to display
    let result = [];

    if (usedToday.length == 0) {
        let skipped = 0;
        if (usedPics.length % 6 !== 0) {
            // the participant must have started a set of emotional images
            // before today and not finished it. Mark the remaining ones
            // in that set as skipped
            skipped = 6 - usedPics.length % 6;
            apiClient.markEmopicsSkipped(nextUnused.slice(0, skipped));
        }
        result = nextUnused.slice(skipped, skipped + 6);
    } else if (usedToday.length == 6) {
        result = nextUnused.slice(0, 6);
    } else if (usedToday.length == 12) {
        result = [];
    } else if (usedToday.length > 12) {
        throw new Error(`Expected a maximum of 12 emotional images to have been displayed today, but found ${usedToday.length}.`);
    } else {
        // They must have started a session today and had something go wrong before they finished
        // rating the emotional images. Show them the remaining ones.
        const remaining = 6 - usedToday.length % 6;
        result = nextUnused.slice(0, remaining);
    }

    return result.map(r => ({url: `${awsSettings.ImagesUrl}/emopics/${r.file}`, order: r.order}));

}