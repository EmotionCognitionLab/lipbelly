<template>
    <div class="wrapper">
        <div class="instruction" v-if="step==0">
            One moment while we load your data...
        </div>
        <div v-else-if="step==1">
            <RestComponent :totalDurationSeconds=300 @timerFinished="timerFinished">
                <template #preText>
                    <div class="instruction">
                        Thank you. Next, we would like to get baseline measurements of your heart rate for five minutes while you rest.
                        The ideal position for this is to sit on a chair with your feet flat on the floor and hands resting on your legs.
                        When you are ready, please clip your pulse measurement device onto your earlobe and insert the other end into the computer.
                        Click "Start" when you're ready to begin.
                    </div>
                </template>
            </RestComponent>
        </div>
        <div v-else-if="step==2">
            <PacedBreathingComponent :showScore="false" :startRegimes="[{durationMs: 300000, breathsPerMinute: 15, randomize: false}]" :condition="'N/A'" @pacerFinished="pacerFinished" @pacerStopped="pacerStopped" />
        </div>
    </div>
</template>

<script setup>
    import { ref, onBeforeMount } from 'vue';
    import PacedBreathingComponent from './PacedBreathingComponent.vue'
    import RestComponent from './RestComponent.vue'
    import { SessionStore } from '../../session-store'

    // step 0: nothing initialized yet
    // step 1: user has not done rest breathing
    // step 2: user has completed rest breathing
    let step = ref(0)
    let pacerHasFinished = false
    
    
    onBeforeMount(async() => {
        const stage = 3
        window.mainAPI.setStage(stage)

        const restBreathingDays = await window.mainAPI.getRestBreathingDays(stage)
        if (restBreathingDays.size < 1) {
            step.value = 1
            return
        }
        const pacedBreathingDays = await window.mainAPI.getPacedBreathingDays(stage)
        if (pacedBreathingDays.size < 1) {
            step.value = 2
            return
        }
        // They have already done rest and paced breathing
        // We have no way to know if they have done the survey or not
        // TODO should we take them to the survey
        // (which might mean they fill it out more than once)
        // or just show an "all done" screen?
        await showSurvey()
        return
    })

    async function nextStep() {
        if (step.value == 2) {
            await showSurvey()
        } else {
            step.value += 1
        }
    }

    async function showSurvey() {
        const session = await SessionStore.getRendererSession()
        const idToken = session.getIdToken().getJwtToken();
        if (!idToken) {
            throw new Error('No id token found in session; unable to proceed to memory survey')
        }
        const payload = idToken.split('.')[1];
        const tokenobj = JSON.parse(atob(payload));
        const uid = tokenobj.sub;
        window.location.href = `https://usc.qualtrics.com/jfe/form/SV_8ca5c2i5hXdCK2i?uid=${uid}`
    }

    function timerFinished() {
        nextStep()
    }

    function pacerFinished() {
        pacerHasFinished = true
    }

    function pacerStopped() {
        if (pacerHasFinished) {
            // we're all done - the pacer finished and when the sensor
            // stopped this got emitted
            nextStep()
        }
    }

</script>
<style scoped>
    .wrapper {
    display: flex;
    margin: auto;
    flex: 1 1 100%;
    width: 100%;
    justify-content: center;
    }
</style>
