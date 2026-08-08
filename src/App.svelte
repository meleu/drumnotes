<script lang="ts">
  import Grid from './components/Grid.svelte';
  import Staff from './components/Staff.svelte';
  import Tempo from './components/Tempo.svelte';
  import Transport from './components/Transport.svelte';
</script>

<main>
  <h1>drumnotes</h1>
  <div class="controls">
    <Transport />
    <Tempo />
  </div>
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

  /* One row of controls on a desktop, wrapping to two on a narrow phone. */
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    margin-bottom: 1rem;
  }

  h1 {
    margin: 0 0 1rem;
    font-size: 1.25rem;
    font-weight: 600;
  }
</style>
