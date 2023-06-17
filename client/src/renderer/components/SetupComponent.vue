<template>
    <div class="wrapper">
        <div class="instruction" v-if="step==0">
            One moment while we load your data...
        </div>
        <div v-else-if="step==1">
            <RestComponent @timerFinished="timerFinished">
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
        <div v-else-if="step==3">
            <ConditionAssignmentComponent @complete="nextStep" />
        </div>
    </div>
</template>

<script setup>
    import { ref, onBeforeMount } from 'vue';
    import ConditionAssignmentComponent from './ConditionAssignmentComponent.vue'
    import PacedBreathingComponent from './PacedBreathingComponent.vue'
    import RestComponent from './RestComponent.vue'
    import { useRouter } from "vue-router"

    const router = useRouter()

    // step 0: nothing initialized yet
    // step 1: user has not done rest breathing
    // step 2: user has completed rest breathing
    // step 3: user has completed paced breathing
    // step 4: user has completed assignment to condition
    let step = ref(0)
    let pacerHasFinished = false
    
    
    onBeforeMount(async() => {
        window.mainAPI.setStage(1)

        const restBreathingDays = await window.mainAPI.getRestBreathingDays(1)
        if (restBreathingDays.size < 1) {
            step.value = 1
            return
        }
        const pacedBreathingDays = await window.mainAPI.getPacedBreathingDays(1)
        if (pacedBreathingDays.size < 1) {
            step.value = 2
            return
        }
        if (await window.mainAPI.getKeyValue('isAssignedToCondition') !== 'true') {
            step.value = 3
            return
        }
        step.value = 4
        return
    })

    function nextStep() {
        if (step.value == 3) {
            router.push({path: '/training'})
        } else {
            step.value += 1
        }
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
