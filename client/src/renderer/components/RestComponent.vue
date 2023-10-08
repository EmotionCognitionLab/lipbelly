<template>
    <div class="instruction" v-if="!done">
        <slot name="preText">
            When you are ready to begin please press the start button.
            Please get into a comfortable position on a chair or on a pillow, finding a position with your back and neck upright. Please rest and do not do anything during this portion.
        </slot>
        <EmWaveListener :showIbi=false @pulseSensorCalibrated="startTimer" @pulseSensorStopped="sensorStopped" @pulseSensorSignalLost="sensorStopped" @pulseSensorSignalRestored="startTimer" @pulseSensorSessionEnded="resetTimer" ref="emwaveListener"/> 
        <br/>
        <TimerComponent :secondsDuration=totalDurationSeconds :showButtons=false @timerFinished="stopSession" ref="timer" />
    </div>
    <div class="instruction" v-else>
        <slot name="postText">
            All done for today! Please come back tomorrow for more training.
            <br/>
            <button class="button"  @click="quit">Quit</button>
        </slot>
    </div>
</template>
<script setup>
import { ref, onMounted } from 'vue'
import EmWaveListener from './EmWaveListener.vue'
import TimerComponent from './TimerComponent.vue'
import { CountdownTimer } from '../../countdown-timer'

const props = defineProps({totalDurationSeconds: Number, segmentDurationSeconds: { type: Number, default: -1 }, audioSrc: String})
const emwaveListener = ref(null)
const timer = ref(null)
const done = ref(false)
const emit = defineEmits(['timer-finished'])
let timerDone = false
let segmentTimer = null
let remainingSegmentCount = 0
let audio = null

onMounted(() => {
    if (props.segmentDurationSeconds > 0) {
        remainingSegmentCount = Math.floor((props.totalDurationSeconds / props.segmentDurationSeconds)) - 1 // -1 because we already save the average coherence when the total time runs out
        if (remainingSegmentCount > 0) {
            segmentTimer = new CountdownTimer(props.segmentDurationSeconds)
            segmentTimer.subscribe(saveSegmentAverageCoherence)
        } 
    }

    if (props.audioSrc) {
        audio = new Audio(props.audioSrc)
        audio.addEventListener('error', (err) => { 
            console.error('audio errored', err)
            console.log('audio err code', audio.error.code)
            console.log('audio err msg', audio.error.message)
        })
    }
})

async function startTimer() {
    timer.value.running = true
    if (segmentTimer) segmentTimer.start()
    if (audio) audio.play()
}

function sensorStopped() {
    if (timerDone) {
        // then we've finished here and this is being called b/c
        // the emwave sensor has been successfully stopped,
        // which means we're totally done here
        emit('timer-finished')
        done.value = true
        if (audio) {
            audio.pause()
            audio.currentTime = 0
        }
    }
    timer.value.running = false
    if (segmentTimer) segmentTimer.stop()
    if (audio) {
        audio.pause()
    }
}

function resetTimer() {
    timer.value.reset()
    if (segmentTimer) segmentTimer.reset()
    if (audio) {
        audio.pause()
        audio.currentTime = 0
    }
}

function stopSession() {
    timerDone = true
    emwaveListener.value.stopSensor = true
    if (segmentTimer) segmentTimer.stop()
    if (audio) {
        audio.pause()
        audio.currentTime = 0
    }
}

function saveSegmentAverageCoherence() {
    window.mainAPI.notifyAverageCoherence()
    remainingSegmentCount -= 1
    if (remainingSegmentCount > 0) {
        segmentTimer.reset()
        segmentTimer.start()
    }
}

function quit() {
    window.mainAPI.quit()
}

</script>
