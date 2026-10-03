import { TRAINING, trainingOpen, type TrainingId } from "../config.ts";
import { snap } from "../exact.ts";
import { TRAINING_RESET_GEMS } from "../gems.ts";
import { trainingMaxed, trainingPoints, trainingSpeed } from "../loadout.ts";
import { BOOST_FOREVER } from "../shop/entitlements.ts";
import { claimBoost, doneAt, finishGems, nextTrainerGems, trainingGold, trainingJob, trainingMs, workLeft, trainingSlots, type TrainingJob } from "../training-jobs.ts";
import { affordsGems, type DeskHost } from "./desk.ts";
import { changeLoadout } from "./hero-sync.ts";

const rowOf = (id: TrainingId) => TRAINING.find((t) => t.id === id)!;

/** The Training tab's commands: ranks bought with training points, or
 * trained by a trainer paid in Gold over the wall clock, the trainers and
 * their boost, and resets. Ranks reach a run inside at once. */
export class TrainingDesk {
  /** Ranks trainers finished and not yet announced, oldest first; the app
   * takes them for its notifications. */
  done: { id: TrainingId; level: number }[] = [];

  constructor(private readonly host: DeskHost) {}

  private get save() {
    return this.host.save;
  }

  /** Whether the Training skill's tab and commands are open: owned, or
   * every page shown in Dev mode. */
  private get open() {
    return !!this.save.upgrades.training || this.save.settings.devMode;
  }

  /** Whether one more rank of `id` can be trained at all: its row shows,
   * and it isn't at its most. */
  private canTrain(id: TrainingId) {
    return this.open && trainingOpen(rowOf(id), this.save.upgrades) && !trainingMaxed(this.save, id);
  }

  /** Buys one more rank of `id` with training points: it counts at once.
   * A trainer training the stat stops, as `cancel` does: its Gold comes
   * back and the time spent becomes time credit. Refused without the
   * Training skill, at the stat's most, or without the points. With Dev
   * free purchases it costs nothing. */
  train(id: TrainingId) {
    this.settle();
    const row = rowOf(id), free = this.host.free;
    if (!this.canTrain(id) || !this.affordsPoints(row.cost)) return false;
    this.cancel(id);
    return changeLoadout(this.save, () => {
      if (!free) this.save.trainingPaid[id].points += row.cost;
      this.save.training[id]++;
    });
  }

  private affordsPoints(points: number) {
    return this.host.free || trainingPoints(this.save).left >= points;
  }

  /** Pays a trainer `trainingGold` to train one more rank of `id`: it
   * takes `trainingMs` of the wall clock (less any time credit, used up
   * first) and counts once that has passed (`settle`). Refused without the
   * Training skill, for a stat already in training or at its most, with
   * every trainer busy, or without the Gold. With Dev free purchases it
   * costs nothing and counts at once. */
  trainWithGold(id: TrainingId) {
    this.settle();
    const save = this.save;
    if (!this.canTrain(id) || trainingJob(save.trainingJobs, id)) return false;
    if (this.host.free) return changeLoadout(save, () => { save.training[id]++; });
    const ranks = save.training[id], gold = trainingGold(rowOf(id).cost, ranks);
    if (save.trainingJobs.length >= trainingSlots(save) || save.gold < gold) return false;
    this.start(id, gold, this.host.clock());
    // Time credit can cover the whole rank.
    this.settle();
    return true;
  }

  /** Pays `gold` and starts a trainer on the next rank of `id` at `now`,
   * its time less any time credit (used up first). */
  private start(id: TrainingId, gold: number, now: number) {
    const save = this.save, ms = trainingMs(save.training[id], trainingSpeed(save)),
      credit = Math.min(ms, save.trainingCredit);
    save.gold = snap(save.gold - gold);
    save.trainingCredit -= credit;
    save.trainingJobs.push({ id, startedAt: now, completesAt: doneAt(ms - credit, save.trainingBoostUntil, now), gold, ms });
  }

  /** Whether `id`'s trainer starts its next rank as soon as one is done. */
  autoContinues(id: TrainingId) {
    return this.save.trainingAuto.includes(id);
  }

  /** Turns `id`'s auto-continue on or off: while on, each rank its trainer
   * finishes starts the next at once, when the Gold is there. */
  setAutoContinue(id: TrainingId, on: boolean) {
    const auto = this.save.trainingAuto.filter((a) => a !== id);
    this.save.trainingAuto = on ? [...auto, id] : auto;
  }

  /** Starts the next rank of `id` the moment `after` finished, if its
   * auto-continue is on, it can train further and the trainer's Gold is
   * held (none with Dev free purchases, though the rank still takes its
   * time). */
  private continueAfter(after: TrainingJob) {
    const save = this.save, id = after.id;
    if (!this.autoContinues(id) || !this.canTrain(id) || trainingJob(save.trainingJobs, id)) return;
    const gold = this.host.free ? 0 : trainingGold(rowOf(id).cost, save.training[id]);
    if (save.trainingJobs.length < trainingSlots(save) && save.gold >= gold) this.start(id, gold, after.completesAt);
  }

  /** The training time (ms, at the normal rate) the rank of `id` in
   * training still needs: what its timer shows. */
  left(id: TrainingId) {
    const job = trainingJob(this.save.trainingJobs, id);
    return job ? workLeft(job.completesAt, this.save.trainingBoostUntil, this.host.clock()) : 0;
  }

  /** Stops the training of `id`, giving its Gold back and the time already
   * spent on it as time credit. */
  cancel(id: TrainingId) {
    const jobs = this.save.trainingJobs, job = trainingJob(jobs, id);
    if (!job) return false;
    this.refund(job);
    this.save.trainingJobs = jobs.filter((j) => j !== job);
    return true;
  }

  private refund(job: TrainingJob) {
    this.save.gold = snap(this.save.gold + job.gold);
    this.save.trainingCredit += Math.max(0, Math.round(job.ms - this.left(job.id)));
  }

  /** Finishes the rank of `id` in training now, for `finishGems` of the
   * training time its timer shows (none with Dev free purchases). */
  finish(id: TrainingId) {
    const job = trainingJob(this.save.trainingJobs, id);
    if (!job) return false;
    const gems = this.host.free ? 0 : finishGems(this.left(id));
    if (this.save.gems < gems) return false;
    this.save.gems -= gems;
    job.completesAt = Math.min(job.completesAt, this.host.clock());
    return this.settle() > 0;
  }

  /** Buys the next trainer with Gems: one more stat can train at once. */
  buyTrainer() {
    const price = nextTrainerGems(this.save);
    if (!this.affords(price)) return false;
    if (!this.host.free) this.save.gems -= price!;
    this.save.trainers++;
    return true;
  }

  /** Whether `gems` (null: none for sale) can be paid now. */
  private affords(gems: number | null) {
    return gems !== null && affordsGems(this.host, gems);
  }

  /** Claims an hour more of the training boost (an ad will pay for it; for
   * now it is free), up to `BOOST_MAX_MS` banked: while it lasts, ranks in
   * training go twice as fast. Each rank's due time moves to match. */
  claimBoost() {
    this.settle();
    const now = this.host.clock(), until = claimBoost(this.save.trainingBoostUntil, now);
    if (until === null) return false;
    this.boostUntil(until, now);
    return true;
  }

  /** The trainers' ×2 boost runs for good from now (a Premium Pass). */
  boostForever() {
    this.boostUntil(BOOST_FOREVER, this.host.clock());
  }

  /** The boost now lasts until `until`: each rank in training is due when
   * its training left is done at the new rate. */
  private boostUntil(until: number, now: number) {
    const old = this.save.trainingBoostUntil;
    for (const job of this.save.trainingJobs) job.completesAt = doneAt(workLeft(job.completesAt, old, now), until, now);
    this.save.trainingBoostUntil = until;
  }

  /** Counts the ranks whose training the clock has reached, saying so in the
   * status line and queuing them in `done`; returns how many. A run inside
   * gains each at once. */
  /** A stat set to auto-continue starts its next rank from the moment the
   * last was done, so ranks the clock passed while the game was closed
   * count too, in order, as long as the Gold lasts. */
  settle() {
    const save = this.save, now = this.host.clock(), finished: TrainingJob[] = [];
    if (!this.due(now)) return 0;
    changeLoadout(save, () => {
      for (let job = this.due(now); job; job = this.due(now)) {
        save.trainingJobs = save.trainingJobs.filter((j) => j !== job);
        this.complete(job);
        this.continueAfter(job);
        finished.push(job);
      }
    });
    this.host.message = `Training · ${[...new Set(finished.map((j) => rowOf(j.id).name))].join(", ")} complete.`;
    return finished.length;
  }

  /** The earliest rank in training due by `now`, if any. */
  private due(now: number) {
    return this.save.trainingJobs.reduce<TrainingJob | undefined>((first, j) => j.completesAt <= now && (!first || j.completesAt < first.completesAt) ? j : first, undefined);
  }

  /** Counts a rank a trainer finished and records what it was paid with. */
  private complete(job: TrainingJob) {
    const save = this.save, paid = save.trainingPaid[job.id];
    save.training[job.id]++;
    paid.gold = snap(paid.gold + job.gold);
    paid.ms += job.ms;
    this.done.push({ id: job.id, level: save.training[job.id] });
  }

  /** Resets a Training stat to no ranks for `TRAINING_RESET_GEMS` Gems
   * (none with Dev free purchases), returning what its ranks were paid
   * with: the training points, the Gold, and the trainers' time as time
   * credit. A rank still in training is stopped, the same way. */
  reset(id: TrainingId) {
    this.settle();
    const save = this.save, job = trainingJob(save.trainingJobs, id);
    const trained = save.training[id] > 0 || !!job;
    if (!trained || !this.affords(TRAINING_RESET_GEMS)) return false;
    return changeLoadout(save, () => {
      const paid = save.trainingPaid[id];
      if (!this.host.free) save.gems -= TRAINING_RESET_GEMS;
      if (job) this.refund(job);
      save.gold = snap(save.gold + paid.gold);
      save.trainingCredit += paid.ms;
      save.trainingPaid[id] = { points: 0, gold: 0, ms: 0 };
      save.training[id] = 0;
      save.trainingJobs = save.trainingJobs.filter((j) => j.id !== id);
    });
  }
}
