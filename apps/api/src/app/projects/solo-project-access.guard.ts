import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { InstallationService } from '../installation/installation.service';

/** Preserve legacy Team reads while enforcing authenticated Solo ownership. */
@Injectable()
export class SoloProjectAccessGuard extends JwtAuthGuard {
  constructor(private readonly installation: InstallationService) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await this.installation.isSolo())) return true;
    await super.canActivate(context);
    const request = context.switchToHttp().getRequest<{
      user: JwtUser;
      query: { employeeId?: string };
      params: { employeeId?: string };
    }>();
    await this.installation.requireOwner(request.user.id);
    const target = request.query.employeeId ?? request.params.employeeId;
    if (target && target !== request.user.id)
      throw new ForbiddenException(
        'Solo project access is restricted to the owner',
      );
    return true;
  }
}
