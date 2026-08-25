import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type {
  TerminalDevicePrincipal,
  TerminalDeviceRequest,
} from './terminal-device.guard';

export const CurrentTerminalDevice = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TerminalDevicePrincipal => {
    const request = context.switchToHttp().getRequest<TerminalDeviceRequest>();
    return request.terminalDevice as TerminalDevicePrincipal;
  },
);
