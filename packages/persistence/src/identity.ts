import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  Firm,
  FirmId,
  FirmRepository,
  Session,
  SessionStore,
  User,
  UserId,
  UserRepository,
} from "@nowlez/contracts";

/** A durable, dependency-free `Map<id, T>` over a single JSON file (ENOENT = empty). */
class JsonFileMap<T> {
  constructor(private readonly filePath: string) {}

  async readAll(): Promise<Map<string, T>> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Record<string, T>;
      return new Map(Object.entries(parsed));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new Map();
      }
      throw error;
    }
  }

  async writeAll(all: Map<string, T>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(Object.fromEntries(all), null, 2), "utf8");
  }
}

const findUser = (users: Iterable<User>, predicate: (u: User) => boolean): User | undefined => {
  for (const u of users) {
    if (predicate(u)) {
      return u;
    }
  }
  return undefined;
};

export class InMemoryUserRepository implements UserRepository {
  private readonly store = new Map<string, User>();
  async save(value: User): Promise<void> {
    this.store.set(value.id, value);
  }
  async get(id: UserId): Promise<User | undefined> {
    return this.store.get(id);
  }
  async findByEmail(email: string): Promise<User | undefined> {
    return findUser(this.store.values(), (u) => u.email === email);
  }
  async findByPhone(phone: string): Promise<User | undefined> {
    return findUser(this.store.values(), (u) => u.phone === phone);
  }
  async findByGoogleSub(sub: string): Promise<User | undefined> {
    return findUser(this.store.values(), (u) => u.googleSub === sub);
  }
  async list(): Promise<readonly User[]> {
    return [...this.store.values()];
  }
}

export class FileUserRepository implements UserRepository {
  private readonly file: JsonFileMap<User>;
  constructor(filePath: string) {
    this.file = new JsonFileMap(filePath);
  }
  async save(value: User): Promise<void> {
    const all = await this.file.readAll();
    all.set(value.id, value);
    await this.file.writeAll(all);
  }
  async get(id: UserId): Promise<User | undefined> {
    return (await this.file.readAll()).get(id);
  }
  async findByEmail(email: string): Promise<User | undefined> {
    return findUser((await this.file.readAll()).values(), (u) => u.email === email);
  }
  async findByPhone(phone: string): Promise<User | undefined> {
    return findUser((await this.file.readAll()).values(), (u) => u.phone === phone);
  }
  async findByGoogleSub(sub: string): Promise<User | undefined> {
    return findUser((await this.file.readAll()).values(), (u) => u.googleSub === sub);
  }
  async list(): Promise<readonly User[]> {
    return [...(await this.file.readAll()).values()];
  }
}

export class InMemoryFirmRepository implements FirmRepository {
  private readonly store = new Map<string, Firm>();
  async save(value: Firm): Promise<void> {
    this.store.set(value.id, value);
  }
  async get(id: FirmId): Promise<Firm | undefined> {
    return this.store.get(id);
  }
  async list(): Promise<readonly Firm[]> {
    return [...this.store.values()];
  }
}

export class FileFirmRepository implements FirmRepository {
  private readonly file: JsonFileMap<Firm>;
  constructor(filePath: string) {
    this.file = new JsonFileMap(filePath);
  }
  async save(value: Firm): Promise<void> {
    const all = await this.file.readAll();
    all.set(value.id, value);
    await this.file.writeAll(all);
  }
  async get(id: FirmId): Promise<Firm | undefined> {
    return (await this.file.readAll()).get(id);
  }
  async list(): Promise<readonly Firm[]> {
    return [...(await this.file.readAll()).values()];
  }
}

export class InMemorySessionStore implements SessionStore {
  private readonly store = new Map<string, Session>();
  async create(session: Session): Promise<void> {
    this.store.set(session.token, session);
  }
  async get(token: string): Promise<Session | undefined> {
    return this.store.get(token);
  }
  async delete(token: string): Promise<boolean> {
    return this.store.delete(token);
  }
}

export class FileSessionStore implements SessionStore {
  private readonly file: JsonFileMap<Session>;
  constructor(filePath: string) {
    this.file = new JsonFileMap(filePath);
  }
  async create(session: Session): Promise<void> {
    const all = await this.file.readAll();
    all.set(session.token, session);
    await this.file.writeAll(all);
  }
  async get(token: string): Promise<Session | undefined> {
    return (await this.file.readAll()).get(token);
  }
  async delete(token: string): Promise<boolean> {
    const all = await this.file.readAll();
    const existed = all.delete(token);
    if (existed) {
      await this.file.writeAll(all);
    }
    return existed;
  }
}
