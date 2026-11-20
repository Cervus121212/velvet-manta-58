// save — localStorage persistence: cash, jobs done, reputation, the
// player's spot and the clock. Autosaves after every job.
import { SAVE_KEY } from './config.js';

export const saveApi = {
  saveGame(ctx) {
    try {
      const data = {
        cash: ctx.cash,
        completedMissions: ctx.completedMissions,
        missionIndex: ctx.missionIndex,
        x: ctx.player.x, z: ctx.player.z, heading: ctx.player.heading,
        health: ctx.player.health, armour: ctx.player.armour,
        smgAmmo: ctx.player.smgAmmo, minutes: ctx.clock.minutes,
        savedAt: Date.now(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return data;
    } catch (e) { return null; }
  },

  loadGame(ctx) {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      ctx.cash = data.cash;
      ctx.completedMissions = data.completedMissions;
      ctx.missionIndex = data.missionIndex;
      ctx.player.x = data.x; ctx.player.z = data.z; ctx.player.heading = data.heading;
      ctx.player.health = data.health; ctx.player.armour = data.armour;
      ctx.player.smgAmmo = data.smgAmmo;
      ctx.clock.minutes = data.minutes;
      return data;
    } catch (e) { return null; }
  },

  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  },
};
