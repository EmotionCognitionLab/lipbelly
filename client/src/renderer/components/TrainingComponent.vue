<template>
    <div>
        <div id="emopics" v-if="!hasDoneEmoMem && !noTime">
            <EmoMemComponent @finished="hasDoneEmoMem=true"/>
        </div>
        <div v-else>
            <div id="instructions" v-if="!instructionsRead && !breathingDone && !noTime">
                Please make sure to:<br/>
                <ul>
                    <li>plug the USB ear sensor into the laptop</li>
                    <li>attach the ear sensor to your earlobe</li>
                    <li>sit in a comfortable position in a chair and be ready to start a session</li>
                </ul>
                <br/>
                <button @click="instructionsRead=true">Continue</button>
            </div>
            <div id="breathing" v-if="instructionsRead && !breathingDone && !noTime">
                <RestComponent :totalDurationSeconds=sessionDuration :segmentDurationSeconds=600 :audioSrc=audioSrc @timerFinished="sessionDone()">
                    <template #preText v-if="condition == 'A' || condition == 'B'">
                        When you are ready to begin, please press the start button. Please close your eyes and direct your thoughts to your body sensations.
                    </template>
                    <template #preText v-else>
                        When you are ready to begin, please press the start button. Please sit quietly since we are recording your pulse. Please feel free to do whatever you like that does not involve head motion.
                    </template>
                </RestComponent>
            </div>
            <div id="notime" v-if="noTime">
                You don't have enough time to complete another session today. Please come back tomorrow.
                <br/>
                <button class="button" @click="quit">Quit</button>
            </div>
            <div id="upload" v-if="breathingDone && !noTime">
                <UploadComponent>
                    <template #preUploadText>
                        <div class="instruction">Terrific! Please wait while we upload your data...</div>
                    </template>
                    <template #postUploadText>
                            <div class="instruction">Upload complete. Nice work! Please come back {{ todaySegCount < segsPerDay ? 'later today' :'tomorrow' }} for more practice.</div>
                        <br/>
                        <button class="button" @click="quit">Quit</button>
                    </template>
                </UploadComponent>
            </div>
        </div>
    </div>
</template>
<script setup>
    import { ref, onBeforeMount } from 'vue';
    import EmoMemComponent from './EmoMemComponent.vue'
    import RestComponent from './RestComponent.vue'
    import UploadComponent from './UploadComponent.vue'
    import { SessionStore } from '../../session-store'
    import ApiClient from '../../../../common/api/client';
    import awsSettings from '../../../../common/aws-settings.json'

    const hasDoneEmoMem = ref(false)
    const instructionsRead = ref(false)
    const breathingDone = ref(false)
    const noTime = ref(false)
    const todaySegCount = ref(0)
    const audioSrc = ref(null)
    const stage = 2
    const segsPerDay = ref(4)
    const sessionDuration = ref(1200)
    const condition = ref('')

    onBeforeMount(async() => {
        await window.mainAPI.setStage(stage)
        await updateTodaySegCount()
        breathingDone.value = todaySegCount.value >= segsPerDay.value
        if (breathingDone.value) return // sessionDuration and audio don't matter; they're done for the day

        const segsRemaining = segsPerDay.value - todaySegCount.value
        if (segsRemaining == 1) {
            sessionDuration.value = 600
        }
        const sessionMinutes = sessionDuration.value / 60

        const now = new Date()
        const midnight = new Date()
        midnight.setHours(23); midnight.setMinutes(59); midnight.setSeconds(59);
        const minutesRemainingToday = (midnight - now) / (1000 * 60)
        noTime.value = minutesRemainingToday < sessionMinutes
        if (noTime.value) return // audio won't matter; they aren't doing any more today

        condition.value = await getCondition()
        audioSrc.value = selectAudio(sessionMinutes, condition.value)
    })

    async function getCondition() {
        const session = await SessionStore.getRendererSession()
        const apiClient = new ApiClient(session)
        const data = await apiClient.getSelf()
        return data.condition.assigned;
    }

    function selectAudio(sessionMinutes, condition) {
        let file
        if (condition === 'A') {
            file = 'l.m4a'
        } else if (condition === 'B') {
            file = 'b.m4a'
        } else if (condition === 'C') {
            return null
        } else {
            console.error(`Expected condition of A or B or C but got '${condition}'.`)
            throw new Error(`Expected condition of A or B or Cbut got '${condition}'.`)
        }
        if (sessionMinutes == 10) {
            return `${awsSettings.ImagesUrl}/assets/10_${file}`
        } else if (sessionMinutes == 20) {
            return `${awsSettings.ImagesUrl}/assets/20_${file}`
        } else {
            console.error(`Expected session to be 10 or 20 minutes long, but got ${sessionMinutes} minutes.`)
            throw new Error(`Expected session to be 10 or 20 minutes long, but got ${sessionMinutes} minutes.`)
        }
    }

    async function updateTodaySegCount() {
        const todayStart = new Date()
        todayStart.setHours(0); todayStart.setMinutes(0); todayStart.setSeconds(0);
        const todaySegs = await window.mainAPI.getSegmentsAfterDate(todayStart, stage)
        todaySegCount.value = todaySegs.length
    }

    async function sessionDone() {
        await updateTodaySegCount()
        breathingDone.value = true
    }

    function quit() {
        window.mainAPI.quit()
    }

</script>
<style scoped>
    ul {
        display: inline-block;
        text-align:left;
    }
</style>