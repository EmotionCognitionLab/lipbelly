<template>
    <div>
        <div id="emopics" v-if="!hasDoneEmoMem">
            Once we've coded the emotional pictures, this is where they'll show up.
            <button @click="hasDoneEmoMem=true">Continue</button>
        </div>
        <div v-else>
            <div id="instructions" v-if="!instructionsRead">
                Once we decide what we're doing with the instructions, they'll go here.
                <div v-if="condition=='A'">

                </div>
                <div v-else>

                </div>
                <button @click="instructionsRead=true">Continue</button>
            </div>
            <div id="breathing" v-if="instructionsRead">
                <div v-if="condition=='A' && !breathingDone">
                    <RestComponent @timerFinished="breathingDone=true" />
                </div>
                <div v-else-if="condition=='B' && !breathingDone">
                    This is where PacedBreathing will go.
                </div>
            </div>
            <div id="upload" v-if="breathingDone">
                <UploadComponent>
                    <template #preUploadText>
                        <div class="instruction">Terrific! Please wait while we upload your data...</div>
                    </template>
                    <template #postUploadText>
                            <div class="instruction">Upload complete. You're all done for today! Please come back tomorrow for more training.</div>
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
    import ApiClient from '../../../../common/api/client'
    import { SessionStore } from '../../session-store'
    import RestComponent from './RestComponent.vue'
    import UploadComponent from './UploadComponent.vue'

    const hasDoneEmoMem = ref(false)
    const condition = ref(null)
    const instructionsRead = ref(false)
    const breathingDone = ref(false)

    onBeforeMount(async() => {
        await window.mainAPI.setStage(2)

        const session = await SessionStore.getRendererSession()
        const apiClient = new ApiClient(session)
        const data = await apiClient.getSelf()
        condition.value = data.condition.assigned

    })

</script>