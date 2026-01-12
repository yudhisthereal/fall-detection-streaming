using Microsoft.AspNetCore.Mvc;

namespace FallDetection.Streaming.Controllers
{
    public class HomeController : Controller
    {
        public IActionResult Index()
        {
            return View();
        }
    }
}