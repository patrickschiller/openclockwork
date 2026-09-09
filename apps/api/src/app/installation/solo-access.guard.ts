import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { JwtUser } from '../auth/jwt.strategy';
import { InstallationService } from './installation.service';

/** Old public/team endpoints cannot expose archived employee data in Solo. */
@Injectable()
export class SoloAccessGuard extends AuthGuard('jwt') {
  constructor(private readonly installation: InstallationService) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http' || !(await this.installation.isSolo()))
      return true;
    const req = context.switchToHttp().getRequest<{
      path?: string;
      url: string;
      user?: JwtUser;
      method: string;
    }>();
    const path = (req.path ?? req.url.split('?')[0]).replace(
      /^\/api(?=\/)/,
      '',
    );
    if (
      req.method === 'OPTIONS' ||
      ['/health', '/auth/login', '/auth/refresh'].includes(path)
    )
      return true;
    await super.canActivate(context);
    if (!req.user) throw new ForbiddenException('Solo owner access required');
    await this.installation.requireOwner(req.user.id);
    const allowed =
      /^\/(auth|installation|timeentries|projects|customers)(\/|$)/.test(
        path,
      ) || /^\/reports\/solo(\.csv)?$/.test(path);
    if (!allowed)
      throw new ForbiddenException(
        'This team capability is disabled in Solo mode',
      );
    return true;
  }
}
