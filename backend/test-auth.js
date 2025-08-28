// Simple test to check if we can require the auth module
try {
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require('./dist/app.module');
    
    console.log('✓ Successfully loaded NestFactory and AppModule');
    
    async function testBootstrap() {
        try {
            const app = await NestFactory.create(AppModule);
            console.log('✓ Successfully created NestJS app');
            
            const routes = app.getHttpAdapter().getInstance()._router;
            console.log('Available routes:', routes?.stack?.length || 'no routes');
            
            await app.close();
        } catch (error) {
            console.error('✗ Failed to create app:', error.message);
            console.error('Stack:', error.stack);
        }
    }
    
    testBootstrap();
} catch (error) {
    console.error('✗ Failed to load modules:', error.message);
    console.error('Stack:', error.stack);
}