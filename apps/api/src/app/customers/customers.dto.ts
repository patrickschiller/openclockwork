import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpsertCustomerDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 40 })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CustomerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty({ type: String, nullable: true })
  code!: string | null;
  @ApiProperty({ type: String, nullable: true })
  note!: string | null;
  @ApiProperty()
  isActive!: boolean;
  @ApiProperty()
  projectCount!: number;
  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}
