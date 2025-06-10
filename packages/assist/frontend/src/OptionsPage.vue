<template>
  <h1>Thunderbird Assist</h1>
  <nav>
    <router-link to="/general">General</router-link>
  </nav>
  <main>
    <router-view />
  </main>
</template>

<style scoped>
nav {
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #ccc;
}
nav > * {
  margin-left: 1.5rem;
}

.router-link-active {
  font-weight: bold;
  text-decoration: underline;
}
</style>
