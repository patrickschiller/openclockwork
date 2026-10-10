import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { EventsGateway } from '../../../api/src/app/events/events.gateway';
import {
  createTestApp,
  login,
  seedEmployee,
  type TestContext,
} from '../support/test-app';

describe('Realtime session boundary against persisted identity and installation state', () => {
  let ctx: TestContext;
  let gateway: EventsGateway;
  let jwt: JwtService;
  const clients: Socket[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    gateway = ctx.app.get(EventsGateway);
    jwt = ctx.app.get(JwtService);
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });
  afterEach(() => {
    clients.splice(0).forEach((client) => {
      gateway.handleDisconnect(client);
    });
    jest.restoreAllMocks();
  });

  // Exercise the gateway's real async handshake and fanout with real JWT/DB
  // state. The transport is a test socket so security checks need no sleep or
  // races waiting for socket.io's connect acknowledgement.
  function socket(token?: string, header = false): Socket {
    const client = {
      id: `test-socket-${clients.length}`,
      connected: true,
      handshake: {
        auth: header ? {} : { token },
        headers: header ? { authorization: `Bearer ${token}` } : {},
      },
      data: {},
      emit: jest.fn(),
      disconnect: jest.fn(() => {
        client.connected = false;
        gateway.handleDisconnect(client as unknown as Socket);
        return client;
      }),
    } as unknown as Socket;
    clients.push(client);
    return client;
  }

  async function fixture() {
    const owner = await seedEmployee(ctx.prisma, {
      personalNo: 'OWNER',
      firstName: 'Solo',
      lastName: 'Owner',
      email: 'realtime-owner@test.local',
      role: 'HRAdmin',
    });
    const other = await seedEmployee(ctx.prisma, {
      personalNo: 'OTHER',
      firstName: 'Other',
      lastName: 'User',
      email: 'realtime-other@test.local',
    });
    return { owner, other };
  }

  it('rejects refresh, absent, expired and version-mismatched tokens at handshake', async () => {
    const { owner } = await fixture();
    const payload = {
      sub: owner.id,
      email: owner.email,
      role: owner.role,
      ver: 0,
    };
    const tokens = [
      undefined,
      jwt.sign({ ...payload, typ: 'refresh' }),
      jwt.sign({ ...payload, typ: 'access', ver: 1 }),
      jwt.sign({ ...payload, typ: 'access' }, { expiresIn: -1 }),
    ];
    for (const token of tokens) {
      const client = socket(token);
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.data).not.toHaveProperty('user');
    }
  });

  it('uses fresh roles and prevents deactivated sessions from receiving the next event', async () => {
    const { owner } = await fixture();
    const token = await login(ctx.http, owner.email);
    await ctx.prisma.employee.update({
      where: { id: owner.id },
      data: { role: 'Manager' },
    });
    const client = socket(token, true);
    await gateway.handleConnection(client);
    expect(client.data.user.role).toBe('Manager');
    await gateway.broadcast('project:changed', { projectId: 'example' });
    expect(client.emit).toHaveBeenCalledWith('project:changed', {
      projectId: 'example',
    });
    jest.mocked(client.emit).mockClear();
    await ctx.prisma.employee.update({
      where: { id: owner.id },
      data: { isActive: false },
    });
    await gateway.broadcast('project:changed', { projectId: 'private' });
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.emit).not.toHaveBeenCalled();
  });

  it('rechecks Solo ownership for old Team sockets and new handshakes', async () => {
    const { owner, other } = await fixture();
    const ownerToken = await login(ctx.http, owner.email);
    const otherToken = await login(ctx.http, other.email);
    const ownerClient = socket(ownerToken);
    const otherClient = socket(otherToken);
    await gateway.handleConnection(ownerClient);
    await gateway.handleConnection(otherClient);
    await ctx.prisma.installationSettings.upsert({
      where: { id: 1 },
      create: { mode: 'Solo', ownerEmployeeId: owner.id },
      update: { mode: 'Solo', ownerEmployeeId: owner.id },
    });
    await gateway.broadcast('time-entry:created', { employeeId: owner.id });
    expect(ownerClient.emit).toHaveBeenCalledWith('time-entry:created', {
      employeeId: owner.id,
    });
    expect(otherClient.emit).not.toHaveBeenCalled();
    expect(otherClient.disconnect).toHaveBeenCalledWith(true);
    jest.mocked(ownerClient.emit).mockClear();
    await gateway.broadcast('time-entry:created', { employeeId: other.id });
    expect(ownerClient.emit).not.toHaveBeenCalled();
    const denied = socket(otherToken);
    await gateway.handleConnection(denied);
    expect(denied.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects an invalidated password session and accepts the newly issued access token', async () => {
    const { owner } = await fixture();
    const oldToken = await login(ctx.http, owner.email);
    const oldClient = socket(oldToken);
    await gateway.handleConnection(oldClient);
    await ctx.prisma.employee.update({
      where: { id: owner.id },
      data: { authVersion: { increment: 1 } },
    });
    const newClient = socket(await login(ctx.http, owner.email));
    await gateway.handleConnection(newClient);
    await gateway.broadcast('project:changed', {
      projectId: 'after-password-change',
    });
    expect(oldClient.disconnect).toHaveBeenCalledWith(true);
    expect(oldClient.emit).not.toHaveBeenCalled();
    expect(newClient.emit).toHaveBeenCalledWith('project:changed', {
      projectId: 'after-password-change',
    });
    const denied = socket(oldToken);
    await gateway.handleConnection(denied);
    expect(denied.disconnect).toHaveBeenCalledWith(true);
  });

  it('fails closed if authorization cannot be revalidated', async () => {
    const { owner } = await fixture();
    const client = socket(await login(ctx.http, owner.email));
    await gateway.handleConnection(client);
    jest
      .spyOn(ctx.prisma.employee, 'findMany')
      .mockRejectedValueOnce(new Error('Database unavailable'));
    await gateway.broadcast('project:changed', { projectId: 'private' });
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.emit).not.toHaveBeenCalled();
  });
});
