<script lang="ts">
  import Grid from './components/Grid.svelte';
  import Staff from './components/Staff.svelte';
</script>

<main>
  <h1>drumnotes</h1>
  <!-- The grid is entirely above the staff; the two views never interleave. -->
  <Grid />
  <Staff />
</main>

<style>
  main {
    max-width: 60rem;
    margin: 0 auto;
    padding: 1rem;
  }

  h1 {
    margin: 0 0 1rem;
    font-size: 1.25rem;
    font-weight: 600;
  }
</style>
