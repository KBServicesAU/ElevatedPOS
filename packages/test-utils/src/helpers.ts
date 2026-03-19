import { v4 as uuidv4 } from 'uuid';

export function makeId(): string {
  return uuidv4();
}

export function makeOrgId(): string {
  return uuidv4();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomAmount(min = 1, max = 100): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
