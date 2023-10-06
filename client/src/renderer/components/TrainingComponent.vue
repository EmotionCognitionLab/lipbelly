<template>
    <div>
        <div id="emopics" v-if="!hasDoneEmoMem">
            <EmoMemComponent @finished="hasDoneEmoMem=true"/>
        </div>
        <div v-else>
            <div id="instructions" v-if="!instructionsRead && !breathingDone">
                Please make sure to:<br/>
                <ul>
                    <li>plug the USB ear sensor into the laptop</li>
                    <li>attach the ear sensor to your earlobe</li>
                    <li>sit in a comfortable position in a chair and be ready to start a session</li>
                </ul>
                <br/>
                <button @click="instructionsRead=true">Continue</button>
            </div>
            <div id="breathing" v-if="instructionsRead && !breathingDone">
                <RestComponent :totalDurationSeconds=1200 :segmentDurationSeconds=600 :audioSrc=audioSrc @timerFinished="sessionDone()" />
            </div>
            <div id="upload" v-if="breathingDone">
                <UploadComponent>
                    <template #preUploadText>
                        <div class="instruction">Terrific! Please wait while we upload your data...</div>
                    </template>
                    <template #postUploadText>
                            <div class="instruction">Upload complete. Nice work! Please come back {{ todaySegCount < 4 ? 'later today' :'tomorrow' }} for more practice.</div>
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
    const todaySegCount = ref(0)
    const audioSrc = ref(null)
    const stage = 2

    onBeforeMount(async() => {
        await window.mainAPI.setStage(stage)
        await updateTodaySegCount()
        breathingDone.value = todaySegCount.value >= 4
        const session = await SessionStore.getRendererSession()
        const apiClient = new ApiClient(session)
        const data = await apiClient.getSelf()
        if (data.condition.assigned === 'A') {
            audioSrc.value = `${awsSettings.ImagesUrl}/assets/l.m4a`
        } else if (data.condition.assigned === 'B') {
            audioSrc.value = `${awsSettings.ImagesUrl}/assets/b.m4a`
        } else {
            console.error(`Expected condition of A or B but got '${data.condition.assigned}'.`)
            throw new Error(`Expected condition of A or B but got '${data.condition.assigned}'.`)
        }
    })

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