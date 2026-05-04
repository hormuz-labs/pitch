import { listJobs } from '../packages/db/src/index';

async function main() {
  try {
    const jobs = await listJobs();
    console.log('Jobs:', jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
  }
}

main();
