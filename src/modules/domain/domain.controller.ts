import { Controller } from '@nestjs/common';
import { DomainService } from './domain.service';

@Controller('domain')
export class DomainController {
  constructor(private readonly domainService: DomainService) {}
}
