using FallDetection.Streaming.Hubs;
using FallDetection.Streaming.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services
builder.Services.AddControllersWithViews();
builder.Services.AddSignalR();

// Add CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendOnly", policy =>
    {
        policy
            .WithOrigins(
                "http://103.150.93.198",
                "http://103.150.93.198:8000"
            )
            .WithMethods("GET", "POST")
            .AllowAnyHeader();
    });
});


// Register services
builder.Services.AddSingleton<CameraManagementService>();
builder.Services.AddSingleton<StreamingService>();

// Configure Kestrel to listen on port 8000
builder.WebHost.ConfigureKestrel(serverOptions =>
{
    serverOptions.ListenAnyIP(8000);
});

var app = builder.Build();

// Configure HTTP request pipeline
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
}

app.UseStaticFiles();

app.UseRouting();

// CORS MUST be here
app.UseCors("AllowAll");

app.UseAuthorization();

app.MapControllers(); // <-- important for APIs

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.MapHub<StreamHub>("/streamHub");

app.Run();
