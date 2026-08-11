<script lang="ts">
  import Clear from './components/Clear.svelte';
  import Export from './components/Export.svelte';
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
    <Export />
    <!-- Last in the row: the one destructive control, kept as far from Play as
         the row is wide. -->
    <Clear />
  </div>
  <!-- Grid entirely above the staff; the views never interleave. -->
  <Grid />
  <Staff />
</main>

<style>
  main {
    max-width: 60rem;
    margin: 0 auto;
    padding: 1rem;
  }

  /* One row on desktop, wrapping to two on a narrow phone. */
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
