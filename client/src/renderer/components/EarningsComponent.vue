<template>
    <div>
        <div ref="payErr">
        </div>
        <div class="pay-info" ref="payInfo">

        </div>
        <button @click="goToTasks" class="button">Go to Daily Training</button>
    </div>
</template>
<script setup>
import { ref, onBeforeMount } from 'vue'
import { useRouter } from "vue-router"
import { SessionStore } from '../../session-store'
import { Payboard } from "pay-info"
import ApiClient from "../../../../common/api/client.js"
import { getCurrentUser } from '../../../../common/auth/auth'

const router = useRouter();
const payErr = ref(null)
const payInfo = ref(null)

onBeforeMount(async () => {
    const session = await SessionStore.getRendererSession()
    const apiClient = new ApiClient(session)
    const pb = new Payboard(payInfo.value, payErr.value, apiClient, getCurrentUser().userId)
    await pb.refresh()
})

function goToTasks() {
    router.push({path: "/training"})
}

</script>
<style>
    .pay-info table {
        margin-left: auto;
        margin-right: auto;
    }
</style>
<style src="pay-info/style.css"></style>
