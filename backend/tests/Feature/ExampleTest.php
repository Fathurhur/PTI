<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Frontend disajikan Laravel dari folder induk (satu origin dengan API).
 */
class ExampleTest extends TestCase
{
    public function test_root_diarahkan_ke_halaman_login(): void
    {
        $this->get('/')->assertRedirect('/login.html');
    }

    public function test_berkas_frontend_disajikan_dan_folder_backend_tidak_bisa_diakses(): void
    {
        $this->get('/login.html')->assertOk()->assertHeader('content-type', 'text/html; charset=UTF-8');
        $this->get('/js/app.js')->assertOk();
        $this->get('/backend/.env')->assertNotFound();
        $this->get('/backend/composer.json')->assertNotFound();
        $this->get('/../README.md')->assertNotFound();
        $this->get('/README.md')->assertNotFound();
    }
}
