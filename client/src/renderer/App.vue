<template>
  <div id="app">
    <router-view></router-view>
  </div>
</template>

<script>
  export default {
    name: 'client'
  }
</script>

<style>
 body {
  font-family: Arial, sans-serif;
  font-size: 22px;
  line-height: 1.6em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  background-color: beige;
  height: 100%;
  width: 100%;
}
#app {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.instruction {
    max-width: 40em;
    padding: 2.5%;
    margin: auto;
}
</style>
