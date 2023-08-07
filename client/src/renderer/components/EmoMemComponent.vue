<template>
    <div>
        <div class="instruction" id="instructions" v-if="emoPics.length > 0 && !instructionsRead">
            <p>
            Before each meditation practice, you will view 6 images presented one at a time. You will be asked to rate on a scale of 1 to 9 how negative, neutral, or positive you find each picture (1=very negative, 5=neutral, 9=very positive). There are no correct answers; we want to know how these pictures make people feel.

            NOTE: This task involves viewing and labeling emotional pictures, both pleasant and unpleasant. The emotions typically evoked by the pictures include disgust, fear, contentment and amusement.
            </p>
            <button @click="initExperiment">Continue</button>
        </div>
        <div id="experiment" :class="{hidden: !instructionsRead}">
            
        </div>
    </div>
</template>
<script setup>
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)
import { ref, onMounted } from 'vue'
import {initJsPsych} from 'jspsych'
import jsPsychCallFunction from '@jspsych/plugin-call-function'
import jsPsychPreload from '@jspsych/plugin-preload'
import jsPsychHtmlKeyboardResponse from '@jspsych/plugin-html-keyboard-response'
import imageKeyboardResponse from '@jspsych/plugin-image-keyboard-response'
import 'jspsych/css/jspsych.css'
import { SessionStore } from '../../session-store'
import ApiClient from '../../../../common/api/client'
import { emotionalImagesForSession } from '../../emomem-selection'

const emit = defineEmits(['finished'])
const instructionsRead = ref(false)
const emoPics = ref([])
let apiClient
let jsPsych

onMounted(async () => {
    const session = await SessionStore.getRendererSession()
    apiClient = new ApiClient(session)
    emoPics.value = await emotionalImagesForSession(apiClient)
    if (emoPics.value.length == 0) emit('finished')
})

async function initExperiment() {
    jsPsych = initJsPsych({display_element: 'experiment'})
    const timeline = await buildTimeline()
    if (timeline.length == 0) {
        emit('finished')
    } else {
        jsPsych.run(timeline)
    }
    instructionsRead.value = true
}

async function saveRatingWithRetry(apiClient, data, doneCallback) {
    const rating = parseInt(data.response)
    const order = data.order
    const responseTime = data.rt
    const date = dayjs().tz('America/Los_Angeles').format('YYYY-MM-DDTHH:mm:ssZ[Z]')
    
    let count = 0
    let succeeded = false
    let retryDelay = 500
    do {
        try {
            count += 1
            const result = await apiClient.saveEmopicsRating(order, rating, responseTime, date)
            succeeded = result.msg && result.msg === 'Update successful'
        } catch (err) {
            console.error(`Error saving emotional picture rating (rating: ${rating}, order: ${order}) on attempt ${count}.`, err)
        } finally {
            if (!succeeded && count < 4) {
                await new Promise(res => setTimeout(res, retryDelay))
                retryDelay *= 2
            }
        }
    } while (!succeeded && count < 4)
    doneCallback()
}

async function buildTimeline() {
    const preload = {
        type: jsPsychPreload,
        images: emoPics.value.map(p => p.url)
    }

    const imgTrial = {
        timeline: [
            {
                type: imageKeyboardResponse,
                stimulus: jsPsych.timelineVariable('url'),
                stimulus_height: 600,
                maintain_aspect_ratio: true,
                choices: "NO_KEYS",
                trial_duration: 3000
            },
            {
                type: jsPsychHtmlKeyboardResponse,
                stimulus: "Please rate the image you just saw on a 1 to 9 scale, where 1 is very negative, 5 is neutral and 9 is very positive",
                choices: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
                data: { 
                    image: jsPsych.timelineVariable('url'),
                    order: jsPsych.timelineVariable('order')
                 }
            },
            {
                type: jsPsychCallFunction,
                async: true,
                func: function(done){saveRatingWithRetry(apiClient, jsPsych.data.getLastTrialData().trials[0], done)}
            }
        ],
        timeline_variables: emoPics.value,
        on_timeline_finish: function() { emit("finished") }
    }

    return [preload, imgTrial]
}
</script>
<style scope>
    .hidden {
        visibility: hidden;
    }
</style>