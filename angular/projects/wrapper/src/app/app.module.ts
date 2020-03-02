import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

import { TimeclockVisModule } from 'timeclock-vis';

@NgModule({
  declarations: [
    AppComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    TimeclockVisModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
