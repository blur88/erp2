import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateProductTypes1726147000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update existing product types to use new terminology
    await queryRunner.query(`
      UPDATE products 
      SET type = 'Stocked Product' 
      WHERE type = 'goods'
    `);
    
    await queryRunner.query(`
      UPDATE products 
      SET type = 'Service' 
      WHERE type = 'service'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert product types to original values
    await queryRunner.query(`
      UPDATE products 
      SET type = 'goods' 
      WHERE type = 'Stocked Product'
    `);
    
    await queryRunner.query(`
      UPDATE products 
      SET type = 'service' 
      WHERE type = 'Service'
    `);
  }
}