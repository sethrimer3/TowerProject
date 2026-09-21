import type { Enemy, Player } from './entities.ts';
export function predict(player:Player, enemy:Enemy) {
 const hit = Math.max(1,player.attack-enemy.defense);
 const turns = Math.ceil(enemy.hp/hit);
 const damage = Math.max(0,enemy.attack-player.defense)*(turns-1);
 return {hit,turns,damage,survivable:player.hp>damage};
}
